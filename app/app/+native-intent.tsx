/**
 * @file Keeps World App's return link out of the router. After a World ID
 * approval, World App reopens Beam with `bubbleagent://approval`; the approval
 * sheet is still open and resumes polling on its own, so the link only needs
 * to bring the app forward. Without this, expo-router would try to navigate
 * to an `/approval` route that doesn't exist.
 */

/** Matches the approval return link, with or without the scheme. */
const APPROVAL = /^(?:bubbleagent:\/\/|\/)approval(?:[/?#]|$)/i;

/**
 * Rewrites incoming system paths before the router sees them.
 * @param event.path Incoming URL or path.
 * @param event.initial Whether it launched the app.
 * @returns The path unchanged, '' to ignore the approval return link while running, or '/' when it cold-starts the app.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string {
  if (!APPROVAL.test(path)) return path;
  return initial ? '/' : '';
}
