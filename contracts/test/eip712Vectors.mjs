// Prints the EIP-712 digests and intent hash that BeamPay.t.sol pins in `test_ViemVectors`.
// It hashes with viem and the shared `server/src/beamPay.ts` (types, domain, intent hash), so the
// Solidity test proves the contract agrees with what the server signs.
// Run from the repo root (needs `npm ci` in server/ and Node >= 22.18 for TypeScript imports):
//   node contracts/test/eip712Vectors.mjs
import { createRequire } from 'node:module';
import { APPROVAL_TYPES, computeIntentHash, beamPayDomain } from '../../server/src/beamPay.ts';

const { hashTypedData, keccak256, toHex } = createRequire(new URL('../../server/package.json', import.meta.url))('viem');

// Fixed inputs; keep in sync with the constants in test_ViemVectors.
const domain = beamPayDomain(5042002, '0x0000000000000000000000000000000000c0ffee');
const account = '0xe05fcC23807536bEe418f142D19fa0d21BB0cfF7'; // vm.addr(0xA11CE)
const to = '0x0000000000000000000000000000000000000b0b';
const deadline = 1_900_000_000n;
const humanHash = keccak256(toHex('human'));
const cap = 100n * 10n ** 18n;
const amount = 30n * 10n ** 18n;
const intentHash = computeIntentHash('11111111-1111-4111-8111-111111111111', to, amount, 5042002);

const sign = (primaryType, message) => hashTypedData({ domain, types: APPROVAL_TYPES, primaryType, message });

console.log(`bytes32 constant VIEM_INTENT_HASH = ${intentHash};`);
console.log(`bytes32 constant VIEM_LINK_DIGEST = ${sign('HumanLink', { account, humanHash, nonce: 0n, deadline })};`);
console.log(`bytes32 constant VIEM_CAP_DIGEST = ${sign('CapApproval', { account, cap, nonce: 1n, deadline })};`);
console.log(
  `bytes32 constant VIEM_PAY_DIGEST = ${sign('PayApproval', { payer: account, to, amount, intentHash, nonce: 2n, deadline })};`,
);
