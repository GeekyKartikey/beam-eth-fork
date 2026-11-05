# BeamPay contract

`BeamPay` is Beam's payment router. It forwards the native token (USDC on Arc), emits an
`AgentPayment` receipt for every agent payment, and enforces a per-account cap that only a
World-ID-backed approval, signed by Beam's approver key, can exceed. Spec: `PLAN.md` section 6.

The ABI and EIP-712 types are mirrored in `app/src/beamPay.ts` and `server/src/beamPay.ts`.
`server/test/beamPayAbi.test.ts` checks them against the compiled artifact, and `test_ViemVectors`
in `test/BeamPay.t.sol` checks the EIP-712 digests against viem.

| File | What it is |
|---|---|
| `src/BeamPay.sol` | The contract |
| `test/BeamPay.t.sol` | Foundry unit, fuzz and reentrancy tests |
| `test/eip712Vectors.mjs` | Prints the viem digests pinned in `test_ViemVectors` |
| `script/DeployBeamPay.s.sol` | Deploy script |

## Setup

Requires [Foundry](https://book.getfoundry.sh). Dependencies are cloned at pinned tags into `lib/`
(gitignored, no submodules):

```sh
cd contracts
git -c advice.detachedHead=false clone -q --depth 1 --branch v1.17.0 https://github.com/foundry-rs/forge-std lib/forge-std
git -c advice.detachedHead=false clone -q --depth 1 --branch v5.7.0 https://github.com/OpenZeppelin/openzeppelin-contracts lib/openzeppelin-contracts
```

(`forge install` is not used because it installs into the enclosing git repo's root, not `contracts/`.)

## Build and test

```sh
cd contracts
forge build
forge test -vv
```

Then, from `server/`, check the shared ABI against the build output:

```sh
npx vitest run test/beamPayAbi.test.ts
```

To regenerate the viem vectors after changing the fixed inputs (from the repo root, after `npm ci` in `server/`):

```sh
node contracts/test/eip712Vectors.mjs
```

## Deploy

The deploy script reads:

| Variable | Required | Meaning |
|---|---|---|
| `APPROVER_ADDRESS` | yes | Address of the server's approver key (`APPROVER_PRIVATE_KEY` in `server/.env`) |
| `DEFAULT_CAP_WEI` | no | Default per-payment cap. Default: Arc `25e18` (25 USDC). Required on other chains |
| `DEPLOYER_KEY` | yes | Funded deployer private key, passed on the command line |

### Arc testnet (chain 5042002)

1. Fund the deployer at https://faucet.circle.com, choosing **Arc Testnet** (USDC is the gas token).
2. Deploy:

```sh
cd contracts
export APPROVER_ADDRESS=0x...   # approver key's address
forge script script/DeployBeamPay.s.sol \
  --rpc-url https://rpc.testnet.arc.network \
  --broadcast --private-key $DEPLOYER_KEY
```

The log prints `BeamPay deployed at 0x...`. Put it in the app and server network config.

### Verify

Constructor arguments must match the deployment:

```sh
ARGS=$(cast abi-encode "constructor(address,uint256)" $APPROVER_ADDRESS 25000000000000000000)
```

Arc testnet explorer is Blockscout-style (`https://testnet.arcscan.app`, which redirects to
`https://explorer.testnet.arc.io`). **Confirm explorer API URL** on setup day:

```sh
forge verify-contract <BEAMPAY_ADDRESS> src/BeamPay.sol:BeamPay \
  --chain-id 5042002 --constructor-args $ARGS \
  --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/
```

For any other Blockscout-style explorer the pattern is `--verifier blockscout --verifier-url <explorer>/api/`.

## Arc Studio

The Arc prize requires building in **Arc Studio**, Circle's AI coding agent for Arc apps (web app,
also usable as a subagent from Claude Code, Codex and Cursor). This repo is the source of truth;
Studio is where the contract is shown being built, tested and deployed to Arc. Confirm the exact
menu names in Studio on setup day.

1. **Import.** Create a new Studio project named `BeamPay`. Add `src/BeamPay.sol` and
   `test/BeamPay.t.sol` (or point Studio at this repository and the `contracts/` folder). The contract
   imports `@openzeppelin/contracts/utils/cryptography/{EIP712,ECDSA}.sol` (v5.7.0); if Studio does
   not resolve OpenZeppelin automatically, add it as a dependency at that version.
2. **Test.** Ask Studio to run the Foundry tests (`forge test -vv`). All tests must pass, as they
   do locally. Ask Studio for its contract review as well and note any findings in the PR.
3. **Deploy.** Ask Studio to deploy `BeamPay` to **Arc Testnet** with constructor arguments
   `(APPROVER_ADDRESS, 25000000000000000000)`. Fund the Studio deployer from
   https://faucet.circle.com (Arc Testnet) if it asks.
4. **Record.** Copy the deployed address into the app and server network config, use Studio's
   activity view (transactions and decoded events) in the demo, and export any Studio edits back
   into `contracts/` so the repo keeps building without Studio.

Arc Studio project URL: `<PASTE ARC STUDIO PROJECT URL HERE>`

Arc testnet BeamPay address: `<PASTE ADDRESS HERE>`

## Security and threat model

- **The cap guards the agent path, not custody.** `pay` refuses anything above `capFor(sender)`; only
  `payWithApproval` exceeds it. The user's wallet can always send funds directly, outside BeamPay, by
  design.
- **The approver key cannot move funds.** BeamPay never holds a balance: every payment forwards
  `msg.value` in the same call, and there is no `receive` or `fallback`. A signature only authorizes
  the payer's own transaction for one exact `(payer, to, amount, intentHash, nonce, deadline)`. A
  leaked approver key lets an attacker approve over-cap payments for a user who is already signing
  transactions, never take funds from anyone.
- **Over-cap approvals need a linked human.** `payWithApproval` reverts `NotLinked` unless the payer
  linked a World ID (`humanOf`), and the server signs only after a fresh World ID check of that human.
- **Replay.** Every approval consumes the caller's nonce, and the EIP-712 domain binds the chain and
  contract address. Approvals expire at their deadline (minutes).
- **Reentrancy.** Checks, effects, interactions everywhere: the nonce is consumed and the receipt
  emitted before the transfer. `test_PayWithApproval_ReentrantRecipientCannotDoubleSpend` proves a
  recipient that replays the approval mid-transfer is rejected.
- **No admin.** No owner, no upgrade path, no pause. The approver and default cap are immutable;
  rotating the approver means deploying a new BeamPay.
- **Lowering is free.** `lowerCap` needs no approval because it only reduces what the agent can spend.
