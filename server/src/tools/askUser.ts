/**
 * @file `ask_user`: records a clarification question with chip options; the agent loop stops after it.
 */
import { z } from 'zod';
import { defineTool } from './tool';

export const askUser = defineTool({
  name: 'ask_user',
  description: (n) =>
    `Asks the user a short question with 1-4 tappable options (for example which recipient, or how much ${n.symbol}). Ends your turn; the tapped option comes back as the next user message.`,
  input: z.object({
    question: z.string().min(1).max(200),
    options: z.array(z.string().min(1).max(100)).min(1).max(4),
  }),
  run: async (ctx, clarification) => {
    ctx.clarification = clarification;
    return { ok: true };
  },
});
