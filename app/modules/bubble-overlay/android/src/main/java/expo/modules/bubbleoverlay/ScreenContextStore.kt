/**
 * In-memory, process-local store for screen captures.
 *
 * A capture lives at most [TTL_MS] and is handed out once: [consume] deletes
 * it. Nothing is ever written to disk or logged.
 */
package expo.modules.bubbleoverlay

import android.os.SystemClock
import java.util.UUID

/** One screen capture. [capturedAt] is epoch ms for JS; [storedAt] is monotonic for the TTL. */
data class ScreenContext(
  val id: String,
  val packageName: String,
  val appLabel: String,
  val capturedAt: Long,
  val text: String,
  val truncated: Boolean,
  val nodeCount: Int,
  val storedAt: Long
) {
  /**
   * Shape matching the `ScreenContext` TS type in `index.ts`.
   * @return A map the Expo bridge converts to a JS object.
   */
  fun toJs(): Map<String, Any> = mapOf(
    "id" to id,
    "packageName" to packageName,
    "appLabel" to appLabel,
    "capturedAt" to capturedAt.toDouble(),
    "text" to text,
    "truncated" to truncated,
    "nodeCount" to nodeCount
  )
}

/** Thread-safe single-use store; all access goes through the object's monitor. */
object ScreenContextStore {
  private const val TTL_MS = 120_000L
  private val captures = HashMap<String, ScreenContext>()

  /**
   * Saves a capture and prunes stale ones.
   * @param packageName Foreground app package.
   * @param appLabel Human-readable app name (best effort).
   * @param text Captured text, already capped at 4000 chars.
   * @param truncated Whether node or char limits cut the capture short.
   * @param nodeCount Nodes visited.
   * @return The new capture id (random UUID).
   */
  @Synchronized
  fun put(packageName: String, appLabel: String, text: String, truncated: Boolean, nodeCount: Int): String {
    val now = SystemClock.elapsedRealtime()
    captures.values.removeAll { now - it.storedAt > TTL_MS }
    val id = UUID.randomUUID().toString()
    captures[id] = ScreenContext(id, packageName, appLabel, System.currentTimeMillis(), text, truncated, nodeCount, now)
    return id
  }

  /**
   * Removes and returns a capture.
   * @param id Capture id from [put].
   * @return The capture, or null if unknown, already consumed, or older than 120 s.
   */
  @Synchronized
  fun consume(id: String): ScreenContext? {
    val entry = captures.remove(id) ?: return null
    return entry.takeIf { SystemClock.elapsedRealtime() - it.storedAt <= TTL_MS }
  }
}
