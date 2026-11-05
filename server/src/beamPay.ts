/**
 * @file BeamPay contract interface: ABI, EIP-712 approval types and hashing.
 *
 * SHARED FILE: byte-identical copies live at `app/src/beamPay.ts` and
 * `server/src/beamPay.ts`. Edit one, copy it to the other;
 * `server/test/shared.test.ts` fails if they drift. The ABI must match
 * `contracts/src/BeamPay.sol`; `server/test/beamPayAbi.test.ts` checks it
 * against the compiled artifact.
 *
 * BeamPay forwards the native token, emits an onchain receipt for every agent
 * payment, and enforces a per-account cap that only a World-ID-backed
 * approval signed by Beam's approver key can exceed.
 */
import { encodeAbiParameters, keccak256, type Address, type Hex, type TypedDataDomain } from 'viem';

export const BEAM_PAY_ABI = [
  {
    type: 'function',
    name: 'pay',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'intentHash', type: 'bytes32' },
      { name: 'sourceApp', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'payWithApproval',
    stateMutability: 'payable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'intentHash', type: 'bytes32' },
      { name: 'sourceApp', type: 'string' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'lowerCap',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'cap', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'raiseCap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'cap', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'linkHuman',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'humanHash', type: 'bytes32' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'capFor',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'humanOf',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'nonces',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approver',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'MAX_CAP',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'AgentPayment',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'intentHash', type: 'bytes32', indexed: true },
      { name: 'sourceApp', type: 'string', indexed: false },
      { name: 'approved', type: 'bool', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'CapChanged',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'cap', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'HumanLinked',
    inputs: [
      { name: 'account', type: 'address', indexed: true },
      { name: 'humanHash', type: 'bytes32', indexed: false },
    ],
  },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'ZeroAmount', inputs: [] },
  { type: 'error', name: 'OverCap', inputs: [{ name: 'cap', type: 'uint256' }] },
  { type: 'error', name: 'Expired', inputs: [] },
  { type: 'error', name: 'BadSignature', inputs: [] },
  { type: 'error', name: 'NotLinked', inputs: [] },
  { type: 'error', name: 'TransferFailed', inputs: [] },
  { type: 'error', name: 'InvalidCap', inputs: [] },
] as const;

/** EIP-712 types signed by the approver. Field order matters and matches the contract. */
export const APPROVAL_TYPES = {
  PayApproval: [
    { name: 'payer', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  CapApproval: [
    { name: 'account', type: 'address' },
    { name: 'cap', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  HumanLink: [
    { name: 'account', type: 'address' },
    { name: 'humanHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

/** Max bytes of `sourceApp` sent onchain. */
export const SOURCE_APP_MAX_BYTES = 32;

/**
 * EIP-712 domain of an BeamPay deployment.
 * @param chainId Chain the contract is deployed on.
 * @param verifyingContract BeamPay address.
 * @returns The typed-data domain ("BeamPay", version "1").
 */
export function beamPayDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: 'BeamPay', version: '1', chainId, verifyingContract };
}

/**
 * Hash that ties an onchain payment to the intent the user reviewed:
 * `keccak256(abi.encode(intentId, to, amountWei, chainId))`.
 * @param intentId Intent UUID.
 * @param to Checksummed recipient.
 * @param amountWei Amount in wei.
 * @param chainId Chain ID.
 * @returns 32-byte hash.
 */
export function computeIntentHash(intentId: string, to: Address, amountWei: bigint, chainId: number): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint256' }],
      [intentId, to, amountWei, BigInt(chainId)],
    ),
  );
}

/**
 * Trims an app label to the onchain `sourceApp` budget without splitting a UTF-8 character.
 * @param label App label such as "WhatsApp".
 * @returns The label, at most 32 UTF-8 bytes.
 */
export function toSourceApp(label: string): string {
  let out = '';
  let bytes = 0;
  for (const ch of label) {
    const size = new TextEncoder().encode(ch).length;
    if (bytes + size > SOURCE_APP_MAX_BYTES) break;
    out += ch;
    bytes += size;
  }
  return out;
}
