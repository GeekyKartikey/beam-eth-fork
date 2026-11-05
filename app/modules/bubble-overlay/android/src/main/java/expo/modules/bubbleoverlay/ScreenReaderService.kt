/**
 * Accessibility service that reads the foreground app's visible text, but only
 * when [captureNow] is called from the beam's tap handler.
 *
 * Privacy: events are ignored, nothing is read in the background, and screen
 * text is never logged or persisted beyond [ScreenContextStore]'s 120 s TTL.
 */
package expo.modules.bubbleoverlay

import android.accessibilityservice.AccessibilityService
import android.content.Intent
import android.content.pm.PackageManager
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/** On-tap screen reader. The system binds it once the user enables it in Accessibility settings. */
class ScreenReaderService : AccessibilityService() {
  companion object {
    /** The bound instance, or null while the service is disabled. */
    @Volatile
    var instance: ScreenReaderService? = null
      private set

    private const val MAX_NODES = 500
    private const val MAX_CHARS = 4000
    private val ZERO_WIDTH = Regex("[\\u200B-\\u200D\\uFEFF]")

    /** Fallback labels when package visibility hides another app's ApplicationInfo. */
    private val KNOWN_LABELS = mapOf(
      "com.whatsapp" to "WhatsApp",
      "com.whatsapp.w4b" to "WhatsApp Business",
      "com.twitter.android" to "X",
      "org.telegram.messenger" to "Telegram",
      "com.android.chrome" to "Chrome",
      "com.google.android.gm" to "Gmail",
      "com.google.android.apps.messaging" to "Messages",
      "com.google.android.keep" to "Keep"
    )
  }

  override fun onServiceConnected() {
    instance = this
  }

  override fun onUnbind(intent: Intent?): Boolean {
    instance = null
    return super.onUnbind(intent)
  }

  override fun onDestroy() {
    instance = null
    super.onDestroy()
  }

  /** Intentionally empty: content is read only in [captureNow]. */
  override fun onAccessibilityEvent(event: AccessibilityEvent?) {}

  override fun onInterrupt() {}

  /**
   * Captures the active window's visible text into [ScreenContextStore].
   * Depth-first in visual order, skipping password and invisible nodes, capped
   * at 500 nodes / 4000 chars, zero-width chars stripped, consecutive
   * duplicates dropped. Empty text is still saved so the UI can explain why.
   *
   * ponytail: nodes are not recycle()d. On API 33+ recycle is a no-op; below
   * that, skipping it only forgoes pooling (instances are GC'd, no leak).
   *
   * @return The capture id, or null if there is no active window or it is our own app.
   */
  fun captureNow(): String? {
    val root = rootInActiveWindow ?: return null
    val pkg = root.packageName?.toString() ?: return null
    if (pkg == packageName) return null

    val out = StringBuilder()
    var nodes = 0
    var last = ""
    val stack = ArrayDeque<AccessibilityNodeInfo>().apply { addLast(root) }
    while (stack.isNotEmpty() && nodes < MAX_NODES && out.length < MAX_CHARS) {
      val node = stack.removeLast()
      nodes++
      if (!node.isPassword && node.isVisibleToUser) {
        val text = clean(node.text)
        val desc = clean(node.contentDescription).takeIf { it != text }.orEmpty()
        for (value in arrayOf(text, desc)) {
          if (value.isNotEmpty() && value != last) {
            out.append(value).append('\n')
            last = value
          }
        }
      }
      // Push children in reverse so the first (top/left) child is visited next.
      for (i in node.childCount - 1 downTo 0) node.getChild(i)?.let { stack.addLast(it) }
    }

    val truncated = out.length > MAX_CHARS || stack.isNotEmpty()
    return ScreenContextStore.put(pkg, resolveLabel(pkg), out.toString().take(MAX_CHARS).trimEnd(), truncated, nodes)
  }

  /**
   * Normalises one node string.
   * @param value Raw text or content description.
   * @return Trimmed text without zero-width characters ("" for null).
   */
  private fun clean(value: CharSequence?): String =
    value?.toString()?.replace(ZERO_WIDTH, "")?.trim().orEmpty()

  /**
   * Best-effort human-readable app name. No QUERY_ALL_PACKAGES: lookups that
   * package visibility blocks fall back to a static map, then the package name.
   * @param pkg Package name of the captured app.
   * @return Display label.
   */
  @Suppress("DEPRECATION") // getApplicationInfo(String, Int) is deprecated on API 33+ only.
  private fun resolveLabel(pkg: String): String =
    try {
      packageManager.getApplicationLabel(packageManager.getApplicationInfo(pkg, 0)).toString()
    } catch (e: PackageManager.NameNotFoundException) {
      KNOWN_LABELS[pkg] ?: pkg
    }
}
