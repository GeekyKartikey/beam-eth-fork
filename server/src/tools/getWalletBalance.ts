/**
 * @file `get_wallet_balance`: the native balance of the user's own wallet and its BeamPay per-payment cap.
 */
import { z } from 'zod';
import { formatAmount } from '../intent';
import { BEAM_PAY_ABI } from '../beamPay';
import { defineTool } from './tool';

export const getWalletBalance = defineTool({
  name: 'get_wallet_balance',
  description: (n) =>
    `Returns the ${n.symbol} balance of the user's own wallet and its per-payment cap (payments above it need World ID approval). Takes no input.`,
  input: z.object({}),
  run: async (ctx) => {
    const { network, wallet } = ctx;
    const [wei, cap] = await Promise.all([
      ctx.chain.getBalance({ address: wallet }),
      ctx.chain.readContract({ address: ctx.beamPay, abi: BEAM_PAY_ABI, functionName: 'capFor', args: [wallet] }),
    ]);
    return {
      address: wallet,
      balance: formatAmount(wei, network, network.amountDecimals),
      balanceWei: wei.toString(),
      perPaymentCap: formatAmount(cap, network, network.amountDecimals),
      perPaymentCapWei: cap.toString(),
    };
  },
});
