/**
 * @file `get_tx_status`: receipt lookup for a transaction hash; no receipt yet means pending.
 */
import { TransactionReceiptNotFoundError } from 'viem';
import { z } from 'zod';
import { txUrl } from '../network';
import { defineTool } from './tool';

export const getTxStatus = defineTool({
  name: 'get_tx_status',
  description: (n) => `Looks up a ${n.name} transaction by hash: success, reverted, or pending, with an explorer link.`,
  input: z.object({ hash: z.templateLiteral(['0x', z.string().regex(/^[0-9a-fA-F]{64}$/)]).describe('32-byte tx hash.') }),
  run: async (ctx, { hash }) => {
    const explorerUrl = txUrl(ctx.network, hash);
    try {
      const receipt = await ctx.chain.getTransactionReceipt({ hash });
      return { status: receipt.status, blockNumber: receipt.blockNumber.toString(), explorerUrl };
    } catch (e) {
      if (e instanceof TransactionReceiptNotFoundError) return { status: 'pending', explorerUrl };
      throw e;
    }
  },
});
