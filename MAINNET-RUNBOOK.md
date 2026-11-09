# Operator runbook

The current preview is locked. This runbook is for the operator after independent review. Do not execute the broadcast step while any prerequisite is missing. The site cannot sign or send a wallet transaction.

## 1. Pin and review

```powershell
git fetch origin main
git status --porcelain
git rev-parse HEAD
npm ci
npm test
forge build
forge test -vv
npm run review:record -- <independent-review-file> <full-reviewed-commit>
```

Expected: clean tree, the exact reviewed commit, passing tests, and an interactive review receipt. The production replay test skips without production inputs. Stop on any mismatch, failing test, missing review, or unresolved finding. A recorded review does not unlock the site.

## 2. Rehearse and check testnet

```powershell
$testRpc = 'https://testnet-rpc.elysium.kinetiq.xyz'
$manager = '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1'
cast chain-id --rpc-url $testRpc
cast code $manager --rpc-url $testRpc
$env:HOOK_FORK_MANAGER = $manager
forge test --match-test test_AtomicLaunchAndCreatorTrigger --fork-url https://rpc.volta.family --fork-block-number 3122111 -vv
Remove-Item Env:HOOK_FORK_MANAGER
```

Expected testnet results are `99801` and `0x` for the mainnet address. The read-only fork runs against the published mainnet manager. Stop if it fails. No official testnet manager was established. A disposable local manager tests mechanics but cannot validate testnet deployment parity. If an official testnet manager is later published, independently verify its source and code, then repeat steps 3–5 with its verified address, chain 99801 and a distinct test-only attester, factory and wallet. Never reuse a mainnet approval on testnet.

## 3. Factory deployment and verification, operator only

Set the verified RPC and independently reviewed ERC-1271 attester address. Use an encrypted Foundry account, with no private keys on the command line. Inspect the dry run before considering a broadcast.

```powershell
cast chain-id --rpc-url $env:ELYSIUM_RPC
cast code $manager --rpc-url $env:ELYSIUM_RPC
cast code $env:REVIEWED_ATTESTER --rpc-url $env:ELYSIUM_RPC
forge create contracts/LaunchFactory.sol:LaunchFactory --rpc-url $env:ELYSIUM_RPC --account hook-operator --constructor-args $manager $env:REVIEWED_ATTESTER
```

Expected: chain 99901, verified nonempty manager and attester code, and dry-run creation data. Stop if bytecode, target, account, or fee estimate differs from the approved deployment plan. Only after independent authorization, the operator may explicitly add `--broadcast` to the same `forge create` command. Save the receipt and deployed address. No launch approval should exist at this stage.

```powershell
cast call $env:REPLAY_FACTORY 'manager()(address)' --rpc-url $env:ELYSIUM_RPC
cast call $env:REPLAY_FACTORY 'attester()(address)' --rpc-url $env:ELYSIUM_RPC
cast keccak (cast code $env:REPLAY_FACTORY --rpc-url $env:ELYSIUM_RPC)
forge verify-contract $env:REPLAY_FACTORY contracts/LaunchFactory.sol:LaunchFactory --show-standard-json-input > work/factory-standard-input.json
```

Expected: constructor addresses match, reviewed runtime matches after accounting for immutables, and standard JSON input is produced. Submit that input and ABI-encoded constructor args to the independently verified Elysium explorer verification interface. If the explorer cannot verify the source, stop. Record links and matching code hashes for the factory, manager and attester.

## 4. Approved calldata and exact read-only replay

Use the reviewed attester process to approve only the intended launch. `approvalHash` returns the raw digest to EIP-191-sign. `attester.ts` offers explicit offline signing from an ignored .env or an external signer callback. Production should use the reviewed external ERC-1271 policy. Prepare the final `LaunchFactory.launch` calldata with the approved arguments, evidence hash, expiry, nonce and signature. Treat those bytes as sensitive until submission or expiry.

In the operator shell set `REPLAY_RPC`, `REPLAY_CHAIN_ID`, `REPLAY_BLOCK`, `REPLAY_FACTORY`, `REPLAY_FACTORY_CODEHASH`, `REPLAY_MANAGER`, `REPLAY_MANAGER_CODEHASH`, `REPLAY_ATTESTER`, `REPLAY_CREATOR`, `REPLAY_FUNDING_WEI` and `REPLAY_CALLDATA` from that exact bundle.

```powershell
forge test --match-test '^test_ExactApprovedReplay' --fork-url $env:REPLAY_RPC --fork-block-number $env:REPLAY_BLOCK -vv
```

Expected: PASS, a matching calldata hash, correct addresses, positive holder sell output across tested phases and router paths. Stop on SKIP, failure, expiration, changed parameters, insufficient creator funding, or missing route coverage. The replay does not deploy to any live network. The preview has no production approval service. Keep wallet submission locked.

## 5. Price the exact call

Set `REPLAY_LOCKED_SEED_WEI` to the native seed measured from the replay. Run:

```powershell
npm run quote:launch
```

Expected: separate HYPE and estimated USD for execution, rollup posting, transaction total and permanently locked seed, with a 30-second validity window. The quote uses the exact sender, target, calldata and value. Stop on any missing estimate, missing price, changed call, expired quote, or unavailable RPC. This offline quote is not connected to wallet submission in the preview. The user must review the maximum funding and actual locked amount separately.

## 6. Release decision

Stop here on the current version. The site has no live launch transaction path. Do not release it until the independent review, verified contracts and source, production signer policy, exact replay and fresh quote are integrated and verified together for the same release and call.
