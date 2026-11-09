# Independent review package

Code under review is commit 980dc32f71a48ceb119fbc06563d7c741b403d5b. Record the exact full commit and compiler artifact hashes in the review. Re-review any change to code, dependencies, target chain, factory, manager or signing policy. The pinned Elysium fork is chain 99901, block 3,122,111.

## Scope

- `contracts/FixedToken.sol` and inherited Solmate ERC-20.
- `contracts/FeeRules.sol` and `contracts/LaunchFeeHook.sol`.
- `contracts/LaunchFactory.sol`, its v4 PoolManager integration, CREATE2 deployment and EOA/ERC-1271 approval checks.
- `compile.ts`, `launch-input.ts`, `simulation.ts`, `test/Factory.t.sol`, `attester.ts`, `quote.ts`, and `release-gate.ts`.
- Pinned Uniswap v4 and Solmate dependency source. Compare the manager runtime against the target chain deployment independently.

## Invariants

Fixed issuance. No token or hook owner, mint, pause, blacklist, reset, parameter mutation, withdrawal or upgrade. Positive outgoing transfers from the immutable registered creator wallet update only a timestamp, and factory seeding cannot trigger it. Zero and self-transfers cannot refresh it. Fees are bounded at 500 bps per direction, excluding any v4 protocol fee. The initiating creator sale can pay the prior rate. Only subsequent sells in the $HOOK pool get the elevated rate while the window is active. Review swap settlement, exact outputs, tiny amounts and exhausted liquidity separately.

The factory creates the token, hook, pool and irreversible two-sided position in one transaction. Verify seed amounts and permanently locked unallocated tokens. Any failure rolls back both the launch and consumption of the nonce. An approval covers chain, factory, manager, creator, funding, both salts, all token and pool inputs, rules, evidence hash, expiry and per-creator nonce. A consumed report or nonce cannot be reused. EOA signatures are low-s. ERC-1271 validity is delegated to the configured verifier.

## Trust assumptions and known limits

The factory trusts the attester to approve only independently verified, passing launches. It cannot determine from a hash whether an execution report is sound. The factory has an immutable attester address. A reviewed ERC-1271 verifier can rotate its signer policy behind that address, invalidating old signatures as appropriate. An EOA attester needs a new factory to rotate. Rotation cannot change existing coin rules. A production ERC-1271 policy and production key were not used in this review candidate.

The preview server accepts no release proofs or signer configuration from requests. A local review receipt is an administrative record. It does not unlock the preview. The exact replay tool requires the deployed target and already-approved bytes. A demo report uses a temporary factory and fixture signer. Neither a demo run nor mock quote qualifies as production evidence. RPC authenticity, fork block availability, bytecode provenance, off-chain approval custody, quote staleness, and reproducible build inputs are in scope. See THREAT-MODEL.md.

### What this does not do

It cannot link unrelated wallets to the creator. An intermediary can wait out the window. Gifts and liquidity deposits from the registered wallet start the window too. The hook has no fee authority over other pools. Tests establish sellability for their tested states and trade sizes. They cannot guarantee market liquidity or future execution.

## Reproduce

```powershell
npm ci
npm test
forge test -vv
$env:HOOK_FORK_MANAGER = '0xe2e105d3f7209a9da11f83ccf3e7398a753823f1'
forge test --match-test test_AtomicLaunchAndCreatorTrigger --fork-url https://rpc.volta.family --fork-block-number 3122111 -vv
Remove-Item Env:HOOK_FORK_MANAGER
```

Review the trace for initiating and subsequent fees, router and pool variation, approval mismatch, expiry, nonce consumption and reverted transaction behavior. `test_ExactApprovedReplay` skips unless supplied an intended factory and approved calldata. Follow MAINNET-RUNBOOK.md to run it. No broadcast is involved in these commands.
