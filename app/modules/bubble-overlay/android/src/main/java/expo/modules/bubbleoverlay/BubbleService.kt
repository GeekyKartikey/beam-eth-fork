/**
 * Foreground service that owns the floating beam overlay.
 *
 * The beam is a 56dp draggable disc in a TYPE_APPLICATION_OVERLAY window.
 * The window is [SHADOW_PAD_DP] larger on every side than the disc so its
 * elevation shadow is not clipped; that transparent margin also counts as
 * beam (overlay windows consume touches across their whole bounds anyway).
 * Press scales the disc down; drag release animates the snap to the edge.
 * Tap: capture the screen, deep-link to `bubbleagent://ask`, then hide.
 * Long-press: stop the service. The app shows/hides it via [ACTION_SHOW] and
 * [ACTION_HIDE] from its AppState listener. The window is created hidden and
 * made visible by the first start command, so a start from the foreground app
 * ([ACTION_HIDE]) never flashes the beam over the app itself.
 */
package expo.modules.bubbleoverlay

import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.Notification
import android.app.PendingIntent
import android.app.Service
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.graphics.Outline
import android.graphics.PixelFormat
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.view.ViewOutlineProvider
import android.view.WindowManager
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.Toast
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.ServiceCompat
import kotlin.math.abs
import kotlin.math.roundToInt

/** Runs while the beam is enabled; started by `BubbleOverlayModule.startBubble`. */
class BubbleService : Service() {
  companion object {
    const val ACTION_SHOW = "expo.modules.bubbleoverlay.SHOW"
    const val ACTION_HIDE = "expo.modules.bubbleoverlay.HIDE"
    const val ACTION_STOP = "expo.modules.bubbleoverlay.STOP"

    /** True between onCreate and onDestroy. */
    @Volatile
    var isRunning = false
      private set

    private const val CHANNEL_ID = "bubble"
    private const val NOTIFICATION_ID = 0xB0B
    private const val SIZE_DP = 56
    private const val EDGE_MARGIN_DP = 8
    /** Transparent window margin around the disc that leaves room for its shadow. */
    private const val SHADOW_PAD_DP = 8
    private const val ELEVATION_DP = 6
    /** Inset of the Beam glyph inside the disc: 56 - 2 * 13 = 30dp glyph (ring ~24dp). */
    private const val GLYPH_PADDING_DP = 13
    private const val PRESSED_SCALE = 0.92f
    private const val PRESS_ANIM_MS = 90L
    private const val RELEASE_ANIM_MS = 160L
    private const val SNAP_ANIM_MS = 200L
    // ponytail: fixed vertical margins approximate status/nav bars; read WindowInsets if the beam ever overlaps them.
    private const val VERTICAL_MARGIN_DP = 48
    private const val TAP_DEBOUNCE_MS = 800L
    private const val LONG_PRESS_MS = 600L
    private const val ASK_URI = "bubbleagent://ask"
  }

  private val handler = Handler(Looper.getMainLooper())
  private lateinit var windowManager: WindowManager
  private lateinit var params: WindowManager.LayoutParams
  /** Root of the overlay window (the shadow-padded container). */
  private var bubble: View? = null
  /** The visible disc inside [bubble]; scaled for press feedback. */
  private var disc: View? = null
  private var snapAnimator: ValueAnimator? = null
  private var snappedRight = true
  private var lastTapAt = 0L

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    // Foreground first: stopping before startForeground() after startForegroundService() crashes the app.
    if (!startInForeground() || !addBubble()) stopSelf()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopSelf()
      ACTION_HIDE -> setBubbleVisible(false)
      else -> setBubbleVisible(true) // ACTION_SHOW, or a null intent on a START_STICKY restart.
    }
    return START_STICKY
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    // Rotation / fold: keep the beam on its edge and inside the new bounds once metrics update.
    handler.post { if (bubble != null) snapAndClamp() }
  }

  override fun onDestroy() {
    isRunning = false
    handler.removeCallbacksAndMessages(null)
    snapAnimator?.cancel()
    bubble?.let { view -> runCatching { windowManager.removeView(view) } }
    bubble = null
    super.onDestroy()
  }

  /**
   * Posts the ongoing notification and promotes the service to the foreground.
   * @return False if the system refused (e.g. a sticky restart from the background on API 31+).
   */
  private fun startInForeground(): Boolean {
    val manager = NotificationManagerCompat.from(this)
    manager.createNotificationChannel(
      NotificationChannelCompat.Builder(CHANNEL_ID, NotificationManagerCompat.IMPORTANCE_LOW)
        .setName(getString(R.string.bubble_channel_name))
        .build()
    )
    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
    } else {
      0
    }
    return try {
      ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), type)
      true
    } catch (e: RuntimeException) {
      false
    }
  }

  /**
   * Builds the low-importance "ready" notification with a Stop action.
   * @return The notification.
   */
  private fun buildNotification(): Notification {
    val stopIntent = PendingIntent.getService(
      this,
      0,
      Intent(this, BubbleService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 1, it, PendingIntent.FLAG_IMMUTABLE)
    }
    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_bubble)
      .setContentTitle(getString(R.string.bubble_notification_title))
      .setContentIntent(openIntent)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, getString(R.string.bubble_notification_stop), stopIntent)
      .build()
  }

  /**
   * Creates the (initially hidden) beam view and adds it as an overlay window at the right edge, ~35% down.
   * @return False if overlay permission is missing or the window could not be added.
   */
  private fun addBubble(): Boolean {
    if (!Settings.canDrawOverlays(this)) return false
    windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
    val size = dp(SIZE_DP)
    val padding = dp(GLYPH_PADDING_DP)
    @Suppress("DEPRECATION") // TYPE_PHONE is the pre-O equivalent of TYPE_APPLICATION_OVERLAY.
    val windowType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      WindowManager.LayoutParams.TYPE_PHONE
    }
    params = WindowManager.LayoutParams(
      windowSize(),
      windowSize(),
      windowType,
      // Windows added from a Service are software-rendered unless asked; elevation shadows need hardware.
      WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
        WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS or
        WindowManager.LayoutParams.FLAG_HARDWARE_ACCELERATED,
      PixelFormat.TRANSLUCENT
    ).apply {
      gravity = Gravity.TOP or Gravity.START
      y = (resources.displayMetrics.heightPixels * 0.35f).roundToInt()
    }
    val discView = ImageView(this).apply {
      setImageResource(R.drawable.bubble_icon)
      setBackgroundResource(R.drawable.bubble_background)
      setPadding(padding, padding, padding, padding)
      elevation = dp(ELEVATION_DP).toFloat()
      outlineProvider = OvalOutline
    }
    val view = FrameLayout(this).apply {
      addView(discView, FrameLayout.LayoutParams(size, size, Gravity.CENTER))
      contentDescription = getString(R.string.bubble_content_description)
      visibility = View.GONE
      setOnTouchListener(BubbleTouchListener())
    }
    return try {
      windowManager.addView(view, params)
      bubble = view
      disc = discView
      snapAndClamp()
      true
    } catch (e: RuntimeException) {
      false
    }
  }

  /**
   * Shows or hides the beam window. A GONE root view makes the whole overlay
   * window invisible, so it no longer intercepts touches.
   * @param visible Target visibility.
   */
  private fun setBubbleVisible(visible: Boolean) {
    if (!Settings.canDrawOverlays(this)) {
      stopSelf() // Overlay permission was revoked while running, so stop.
      return
    }
    bubble?.visibility = if (visible) View.VISIBLE else View.GONE
  }

  /** @return Overlay window edge in px: the disc plus the shadow margin on both sides. */
  private fun windowSize(): Int = dp(SIZE_DP) + 2 * dp(SHADOW_PAD_DP)

  /**
   * Snaps the beam to its current horizontal edge and clamps Y to the screen.
   * Margins apply to the disc, not the padded window around it.
   * @param animate Glide there over [SNAP_ANIM_MS] (drag release) instead of jumping.
   */
  private fun snapAndClamp(animate: Boolean = false) {
    val metrics = resources.displayMetrics
    val window = windowSize()
    val pad = dp(SHADOW_PAD_DP)
    val margin = dp(EDGE_MARGIN_DP) - pad
    val minY = dp(VERTICAL_MARGIN_DP) - pad
    val targetX = if (snappedRight) metrics.widthPixels - window - margin else margin
    val targetY = params.y.coerceIn(minY, maxOf(minY, metrics.heightPixels - window - minY))
    snapAnimator?.cancel()
    snapAnimator = null
    if (!animate) {
      params.x = targetX
      params.y = targetY
      updateLayout()
      return
    }
    val fromX = params.x
    val fromY = params.y
    snapAnimator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = SNAP_ANIM_MS
      interpolator = DecelerateInterpolator()
      addUpdateListener { animator ->
        val f = animator.animatedFraction
        params.x = fromX + ((targetX - fromX) * f).roundToInt()
        params.y = fromY + ((targetY - fromY) * f).roundToInt()
        updateLayout()
      }
      start()
    }
  }

  /**
   * Scales the disc for press feedback.
   * @param pressed True to shrink to [PRESSED_SCALE], false to spring back.
   */
  private fun setPressed(pressed: Boolean) {
    val view = disc ?: return
    val scale = if (pressed) PRESSED_SCALE else 1f
    view.animate()
      .scaleX(scale)
      .scaleY(scale)
      .setDuration(if (pressed) PRESS_ANIM_MS else RELEASE_ANIM_MS)
      .setInterpolator(DecelerateInterpolator())
      .start()
  }

  /** Applies [params]; stops the service if the window is gone (overlay permission revoked). */
  private fun updateLayout() {
    val view = bubble ?: return
    try {
      windowManager.updateViewLayout(view, params)
    } catch (e: RuntimeException) {
      snapAnimator?.cancel()
      stopSelf()
    }
  }

  /**
   * Tap handler: debounce, capture, launch, and only then hide. The order
   * matters because Android 15 lets an app with SYSTEM_ALERT_WINDOW start
   * activities from the background only while its overlay is visible.
   */
  private fun onTap() {
    val now = SystemClock.elapsedRealtime()
    if (now - lastTapAt < TAP_DEBOUNCE_MS) return
    lastTapAt = now
    val id = runCatching { ScreenReaderService.instance?.captureNow() }.getOrNull()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(ASK_URI + (id?.let { "?ctx=$it" } ?: "")))
      .setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      startActivity(intent)
    } catch (e: ActivityNotFoundException) {
      return
    }
    bubble?.let { view -> view.post { view.visibility = View.GONE } }
  }

  /** Long-press action: confirm with a toast and stop. */
  private fun onLongPress() {
    Toast.makeText(this, R.string.bubble_stopped_toast, Toast.LENGTH_LONG).show()
    stopSelf()
  }

  /**
   * Converts dp to px.
   * @param value Density-independent pixels.
   * @return Pixels for the current display.
   */
  private fun dp(value: Int): Int = (value * resources.displayMetrics.density).roundToInt()

  /** Oval shadow outline matching the disc (independent of how the layer-list reports its outline). */
  private object OvalOutline : ViewOutlineProvider() {
    override fun getOutline(view: View, outline: Outline) {
      outline.setOval(0, 0, view.width, view.height)
    }
  }

  /** Tap vs drag via touch slop, long-press after [LONG_PRESS_MS] without a drag, snap on release. */
  private inner class BubbleTouchListener : View.OnTouchListener {
    private val touchSlop = ViewConfiguration.get(this@BubbleService).scaledTouchSlop
    private var downRawX = 0f
    private var downRawY = 0f
    private var startX = 0
    private var startY = 0
    private var dragging = false
    private var longPressed = false
    private val longPress = Runnable {
      longPressed = true
      onLongPress()
    }

    @SuppressLint("ClickableViewAccessibility") // The tap is handled here; the window is not focusable.
    override fun onTouch(v: View, event: MotionEvent): Boolean {
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> {
          snapAnimator?.end() // Finish any glide first so a tap or new drag starts from the edge.
          setPressed(true)
          downRawX = event.rawX
          downRawY = event.rawY
          startX = params.x
          startY = params.y
          dragging = false
          longPressed = false
          handler.postDelayed(longPress, LONG_PRESS_MS)
        }
        MotionEvent.ACTION_MOVE -> {
          val dx = event.rawX - downRawX
          val dy = event.rawY - downRawY
          if (!dragging && (abs(dx) > touchSlop || abs(dy) > touchSlop)) {
            dragging = true
            handler.removeCallbacks(longPress)
          }
          if (dragging) {
            params.x = startX + dx.roundToInt()
            params.y = startY + dy.roundToInt()
            updateLayout()
          }
        }
        MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
          handler.removeCallbacks(longPress)
          setPressed(false)
          when {
            longPressed -> Unit
            dragging -> {
              snappedRight = params.x + v.width / 2 > resources.displayMetrics.widthPixels / 2
              snapAndClamp(animate = true)
            }
            event.actionMasked == MotionEvent.ACTION_UP -> onTap()
          }
        }
      }
      return true
    }
  }
}
