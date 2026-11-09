# $HOOK Behaviour Studio

Program your coin's behaviour in plain English. This preview turns requests into a bounded fee schedule and produces shareable v4 execution reports when Foundry is configured. Launch is locked in the API and UI. The contracts are candidates for further testing.

## Run locally or on Replit

Publish only the public directory for a static preview. No RPC, server or secrets are needed. Locally, Node 24 with npm ci and npm start serves the same saved demo. For authenticated, rate-limited live drafts and fork rehearsals, see PREVIEW-HOSTING.md.

Run `npm test` for TypeScript tests. Install Foundry and run `forge test -vv` for local contract tests. The latter deploys a local v4 PoolManager, mines a real beforeSwap address, funds a two-sided test pool and executes buy/sell round trips for four wallet/trade profiles at three boundary times. The fee invariant has 1,024 fuzz cases. Test fixtures use a mintable test token. The fixed-supply token and attestation-gated atomic factory are tested candidates. The website issues no launch approvals.

## Typed spec v1

Seven integers define the hook. `buyBps` and `sellBps` are steady LP fees. `openingBuyBps` and `openingSellBps` apply for `windowSeconds` after hook creation. The end is exclusive. Each fee is between 0 and 500 basis points. The window is 0–86,400 seconds. Opening fees must be zero when the window is disabled. The other two fields, triggerSellBps and triggerSeconds, elevate sell fees after a nonzero outgoing transfer to another address from the registered creator wallet. The hook reads the token timestamp across routers and pools. The elevated fee applies to subsequent sells in the launch pool. An initiating creator sale can pay the prior rate because the fee is calculated before settlement. The maximum applicable fee wins, and zero disables the trigger. These are LP fees. They accrue to liquidity positions. Protocol fees are separate.

The compiler combines fixed Foundry creation bytecode with ABI-encoded constructor values and finds a CREATE2 salt whose address has the v4 beforeInitialize and beforeSwap permission bits. The input must be a trusted build artifact. Model output is validated as data. Fee curves, wallet limits, deployer triggers, burn and fee splits are outside this preview.

## Elysium deployment research

Mainnet chain ID **99901**, testnet **99801**, native gas **HYPE**. Both mainnet RPCs checked had 24,009 bytes of PoolManager code at the published address. The official Kinetiq testnet RPC returned empty bytecode at the mainnet PoolManager address. No testnet v4 deployment was established.

| Contract | Mainnet address with RPC bytecode |
|---|---|
| PoolManager | `0xe2e105d3f7209a9da11f83ccf3e7398a753823f1` |
| Universal Router | `0x1b341fdd55d56f8e08409a2c25ddfad93eb03c1a` |
| Quoter | `0x379f556c5a748bd7cc9baf0f7a344094ac1814f5` |
| StateView | `0x27ed73ae0652fdcf71d6793412a7525f32be9dfe` |
| PositionManager | `0x1d1c51b9d07fd27d36412a2b66cc23d19eb3e518` |
| Permit2 | `0x000000000022d473030f116ddee9f6b43ac78ba3` |

[ElysPump contract records](https://docs.elyspump.com/?real=1) and [Uniswap router deployment PR](https://github.com/Uniswap/universal-router/pull/534). Volta publishes a different router address, so resolve versions and validate exact targets before wiring a router. [Volta contracts and liquidity mechanics](https://www.volta.family/docs).

Volta documents creator, holder and buyback routing via its own shared hook. ElyOrbit's listing advertises v4 presets and a custom-coin AI API. Its actual input contract and safety gates were not verified. Ignition also advertises deployable hook modules. No indexed exact HOOK ticker surfaced in web search, but explorer API requests returned 404 and no exhaustive token index was available. Treat the ticker as unverified. [ElyOrbit listing](https://larpsium.app/coins?lp=Ascend&sort=hot) · [Ignition Hook Pad](https://www.ignition.family/elysium/hooks).

## Release gate and economics

Start with fees and one opening window. Defer wallet identity features, fee custody, burns and royalties. The candidate factory deploys a fixed supply token, hook and locked two-sided liquidity atomically. Publish creator allocation, initial price, position ticks and actual HYPE deposited. Validate an attested execution report for the exact factory call. Exercise exact-input and exact-output swaps, depleted liquidity and adversarial sequencing on a pinned fork, then rehearse with test HYPE against a verified testnet PoolManager or an isolated local one. Verify source where the explorer supports it. Read the threat model before implementing the factory.

Proposed later economics are zero launch fee, 5% of a separately accounted hook fee for the treasury, and 2% of that same fee for an authenticated original library author on reuse. At a 5% hook fee those shares are 25 and 10 basis points of swap notional respectively, within the user-facing cap. This funds ongoing infrastructure without charging free pools. Treasury buybacks would be separate transactions with published receipts. The current LP-fee hook does not implement fee custody or enforce these rates.

The Elysium fork fixture uses approximately 1.63 million factory execution gas for the creator-sell demo and just under 100 native HYPE, with tick 0 and 100 liquidity units. It locks a large unused token remainder at the factory. These parameters are for reproducibility, not a production liquidity recommendation. Quote execution gas × effective gas price plus rollup posting charges at the time of rehearsal, and show the HYPE seed separately as capital committed. Do not use Foundry's fixture gas as a launch estimate.



## Reproduce a pinned Elysium fork report

Install Foundry and follow the private operator setup in PREVIEW-HOSTING.md. Set the following fork values in .env and restart the server.

```ini
HOOK_FORK_RPC=https://rpc.volta.family
HOOK_FORK_BLOCK=3122111
HOOK_FORK_MANAGER=0xe2e105d3f7209a9da11f83ccf3e7398a753823f1
```

HOOK_FORGE_BIN can point to a local forge executable. Without fork settings, the same fixture uses a locally deployed v4 PoolManager and the report labels that environment. Missing Foundry, timeouts or failing tests yield an unverified report. Without launch inputs, the demo runs with fixture inputs. The specific-launch form runs the supplied wallet, metadata, token salt, liquidity, opening tick, funding and allocation against the same factory source on the fork. It records positive native output for every holder round trip. The demo executes ten round trips: one before the creator sell and small, normal and large trades at each of 0, 1799 and 1800 seconds after it. The simulation deploys a temporary factory with a test signer. It does not approve a production transaction. The factory requires an immutable attester's signature binding chain, factory, manager, creator, funding, launch parameters, report hash, expiry and per-creator nonce. The fixture uses a test signer. Production signing, report replay and wallet submission remain disabled.

## Verify a real Claude key

1. Configure the private operator server as described in PREVIEW-HOSTING.md, add ANTHROPIC_API_KEY to the ignored .env and restart. Run npm run check:claude in the same local configuration.
2. The smoke test paraphrases the demo so it bypasses template matching. Try "For half an hour after the registered creator wallet sends tokens, charge a five percent sell fee." Confirm the private report shows a 5% triggered sell rate, 1,800 seconds, and the specified default steady rate of 0.3%.
3. Ask for a blacklist or fee burn. Confirm the private API rejects it and offers a supported variant.
4. Confirm a real Anthropic request appears in your account usage and no secret appears in the browser response or logs. With a daily budget below $0.05, free-form requests should return a budget error while the template still runs.
5. Confirm the saved private report records a pinned-fork result and the public preview remains locked. A valid key does not enable wallet submission.

## Mainnet checklist

1. Independently review the fixed-supply token, timestamp trigger, transfer and allowance compatibility, factory, immutable attester and signed approval domain. Check the ticker and verify source and deployed code.
2. Select the actual creator, token metadata, salts, pool tick, liquidity and allocation. Review the irrecoverable liquidity and any token remainder held by the factory. The contract requires at least 0.1 HYPE in the locked position.
3. Rehearse the exact final calldata and value against the intended factory and PoolManager on a pinned fork and then testnet where available. Recheck expiry, replay, modified inputs, price movement, exact-output routes and holder sellability at each phase. Use no production key in simulation.
4. Produce a production report that attests the final factory address and code, calldata, value, creator and observed results. Wire a controlled signer to issue the factory approval only after successful replay. Preview reports currently bind simulation evidence by hash but carry no production approval.
5. Estimate the exact approved call with Elysium's Arbitrum NodeInterface, including its parent-chain posting component. Show HYPE and estimated USD for transaction fees and locked capital separately before wallet signing. Current reports show measured simulation execution gas and a HYPE/USDC midpoint estimate of locked capital when available. They do not quote an all-in signing cost.
6. Keep submission disabled until these checks and security review are complete. No mainnet deployment or funds movement is part of this preview.
