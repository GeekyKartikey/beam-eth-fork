/**
 * Expo module `BubbleOverlay`: permission checks and settings shortcuts,
 * beam service control, and one-shot access to screen captures.
 * The JS surface is fixed by `modules/bubble-overlay/index.ts`.
 */
package expo.modules.bubbleoverlay

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Native side of `BubbleOverlay`. All functions are synchronous, matching `BubbleOverlayApi`. */
class BubbleOverlayModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("BubbleOverlay")

    Function("hasOverlayPermission") { Settings.canDrawOverlays(context) }

    Function("requestOverlayPermission") {
      openSettings(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, packageUri())
    }

    Function("isAccessibilityEnabled") { isAccessibilityEnabled() }

    Function("openAccessibilitySettings") {
      openSettings(Settings.ACTION_ACCESSIBILITY_SETTINGS)
    }

    Function("isIgnoringBatteryOptimizations") {
      val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      power.isIgnoringBatteryOptimizations(context.packageName)
    }

    Function("requestIgnoreBatteryOptimizations") {
      openSettings(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, packageUri())
    }

    Function("startBubble") {
      if (!Settings.canDrawOverlays(context)) {
        throw CodedException("E_NO_OVERLAY_PERMISSION", "\"Display over other apps\" permission is not granted.", null)
      }
      if (!BubbleService.isRunning) {
        // Start hidden: the app is in the foreground; its AppState listener shows the beam on background.
        val intent = Intent(context, BubbleService::class.java).setAction(BubbleService.ACTION_HIDE)
        ContextCompat.startForegroundService(context, intent)
      }
    }

    Function("stopBubble") {
      context.stopService(Intent(context, BubbleService::class.java))
      Unit
    }

    Function("showBubble") { sendToBubble(BubbleService.ACTION_SHOW) }

    Function("hideBubble") { sendToBubble(BubbleService.ACTION_HIDE) }

    Function("isBubbleRunning") { BubbleService.isRunning }

    Function("consumeScreenContext") { id: String ->
      ScreenContextStore.consume(id)?.toJs()
    }

    Function("minimizeApp") {
      appContext.currentActivity?.let { activity -> activity.runOnUiThread { activity.moveTaskToBack(true) } }
    }
  }

  /**
   * Checks whether our [ScreenReaderService] is enabled in system settings.
   * @return True if listed in `ENABLED_ACCESSIBILITY_SERVICES`.
   */
  private fun isAccessibilityEnabled(): Boolean {
    val ours = ComponentName(context, ScreenReaderService::class.java)
    val enabled = Settings.Secure.getString(context.contentResolver, Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES)
      ?: return false
    return enabled.split(':').any { ComponentName.unflattenFromString(it) == ours }
  }

  /**
   * Forwards a show/hide action to [BubbleService], only while it runs
   * (never starts it as a side effect).
   * @param action [BubbleService.ACTION_SHOW] or [BubbleService.ACTION_HIDE].
   */
  private fun sendToBubble(action: String) {
    if (BubbleService.isRunning) {
      context.startService(Intent(context, BubbleService::class.java).setAction(action))
    }
  }

  /** @return `package:<our package>` URI for per-app settings screens. */
  private fun packageUri(): Uri = Uri.parse("package:${context.packageName}")

  /**
   * Opens a system settings screen in a new task. Some OEM builds drop these
   * screens, so fall back to this app's App info page.
   * @param action Settings intent action.
   * @param data Optional `package:` URI.
   */
  private fun openSettings(action: String, data: Uri? = null) {
    val intent = Intent(action, data).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    try {
      context.startActivity(intent)
    } catch (e: ActivityNotFoundException) {
      context.startActivity(
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, packageUri()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      )
    }
  }
}
