/**
 * @file `inspect_recipient`: what a 0x address or ENS name points to. Read-only;
 * names resolve with the same shared code the payment path uses.
 */
import { z } from 'zod';
import { normalizeEnsName } from '../ens';
import { formatAmount, stripZeroWidth, toChecksumAddress } from '../intent';
import { defineTool, resolverFor, toolError } from './tool';

export const inspectRecipient = defineTool({
  name: 'inspect_recipient',
  description: (n) =>
    `Checks a recipient on ${n.name}: a 0x address or an ENS name (like rahul.eth). Returns whether it is valid, the resolved address, ` +
    `whether the name is that address's primary name, whether it is a contract, its transaction count and its ${n.symbol} balance.`,
  input: z.object({ recipient: z.string().max(255).describe('The 0x address or ENS name exactly as it appears.') }),
  run: async (ctx, { recipient }) => {
    const raw = stripZeroWidth(recipient).trim();
    let address = toChecksumAddress(raw);
    let name: string | null = null;
    let primaryName: string | null = null;
    if (!address) {
      name = normalizeEnsName(raw);
      if (!name) return toolError('INVALID_ADDRESS', 'That is not a valid 0x address or ENS name.');
      const resolve = resolverFor(ctx);
      if (!resolve) return toolError('NAME_UNAVAILABLE', "Couldn't look up that name. Use the 0x address.");
      const resolved = await resolve(name).catch(() => undefined);
      if (resolved === undefined) return toolError('NAME_UNAVAILABLE', "Couldn't look up that name. Use the 0x address.");
      if (!resolved) return toolError('NAME_NOT_FOUND', `${name} doesn't have an address for ${ctx.network.name}.`);
      address = resolved.address;
      primaryName = resolved.primaryName;
    }
    const [code, txCount, balance] = await Promise.all([
      ctx.chain.getCode({ address }),
      ctx.chain.getTransactionCount({ address }),
      ctx.chain.getBalance({ address }),
    ]);
    return {
      valid: true,
      ...(name ? { name, isPrimaryName: primaryName === name } : {}),
      resolvedAddress: address,
      primaryName,
      isContract: !!code && code !== '0x',
      txCount,
      balance: formatAmount(balance, ctx.network, ctx.network.amountDecimals),
    };
  },
});
