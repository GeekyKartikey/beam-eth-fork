/**
 * @file Ask tab: chat with Beam, the agent, from inside the app.
 *
 * Same agent, checks and review cards as the floating beam's sheet. With no
 * captured screen, "Paste from clipboard" gives Beam something to look at.
 */
import { AskSheet } from '../ask';

/**
 * Ask screen.
 * @returns The full-page chat.
 */
export default function ChatScreen() {
  return <AskSheet ctxId={undefined} page inApp />;
}
