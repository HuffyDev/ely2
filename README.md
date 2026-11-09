# $HOOK Behaviour Studio

Program your coin's behaviour in plain English. This preview turns requests into a bounded fee schedule and produces shareable v4 execution reports when Foundry is configured. Launch is locked in the API and UI. The contracts are candidates for further testing.

## Run locally or on Replit

Use Node.js 24 and run `npm ci` followed by `npm start`. Open port 3000, or set `PORT`. Library templates work without credentials. For free-form drafting, copy `.env.example` to `.env` and fill in `ANTHROPIC_API_KEY` locally. Use persistent storage for `hook.sqlite`. The daily AI cap defaults to $1 per UTC day, with a conservative $0.05 reserved before each small Sonnet 5.5 call, including failed calls. The API never requests a wallet key. Avoid using a public unrestricted deployment for paid AI access without authentication and traffic limits.

Run `npm test` for TypeScript tests. Install Foundry and run `forge test -vv` for local contract tests. The latter deploys a local v4 PoolManager, mines a real beforeSwap address, funds a two-sided test pool and executes buy/sell round trips for four wallet/trade profiles at three boundary times. The fee invariant has 1,024 fuzz cases. Test fixtures use a mintable test token. The fixed-supply token and attestation-gated atomic factory are tested candidates. The website issues no launch approvals.

## Typed spec v1

Seven integers define the hook. `buyBps` and `sellBps` are steady LP fees. `openingBuyBps` and `openingSellBps` apply for `windowSeconds` after hook creation. The end is exclusive. Each fee is between 0 and 500 basis points. The window is 0–86,400 seconds. Opening fees must be zero when the window is disabled. The other two fields, triggerSellBps and triggerSeconds, elevate sell fees when the creator funds a sell through the factory router. Other routers and intermediary wallets bypass the trigger. The maximum applicable fee wins, and zero disables the trigger. These are LP fees. They accrue to liquidity positions. Protocol fees are separate.

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

The Elysium fork fixture uses 1,552,126 factory execution gas for the creator-sell demo and just under 100 native HYPE, with tick 0 and 100 liquidity units. It locks a large unused token remainder at the factory. These parameters are for reproducibility, not a production liquidity recommendation. Quote execution gas × effective gas price plus rollup posting charges at the time of rehearsal, and show the HYPE seed separately as capital committed. Do not use Foundry's fixture gas as a launch estimate.



## Reproduce a pinned Elysium fork report

Install Foundry, then set the following in .env and restart the website.

```ini
HOOK_FORK_RPC=https://rpc.volta.family
HOOK_FORK_BLOCK=3122111
HOOK_FORK_MANAGER=0xe2e105d3f7209a9da11f83ccf3e7398a753823f1
```

HOOK_FORGE_BIN can point to a local forge executable. Without fork settings, the same fixture uses a locally deployed v4 PoolManager and the report labels that environment. Missing Foundry, timeouts or failing tests yield an unverified report. The run uses the exact draft rules with fixed fixture metadata, seed, creator allocation and swap sizes. It records positive native output for every holder round trip. The demo executes ten round trips: one before the creator sell and small, normal and large trades at each of 0, 1799 and 1800 seconds after it. It does not approve a creator-specific launch. The factory requires an immutable attester's signature binding chain, factory, manager, creator, funding, launch parameters, report hash and expiry. The fixture uses a test signer. Production signing, report replay and wallet submission remain disabled.

## Verify a real Claude key

1. Add ANTHROPIC_API_KEY to the ignored .env and restart. Studio should show Claude Sonnet 5.5.
2. Paraphrase the demo so it bypasses template matching. Try "For half an hour after the creator sells through the HOOK router, charge a five percent sell fee." Confirm the Claude report shows a 5% triggered sell rate, 1,800 seconds, and the specified default steady rate of 0.3%.
3. Ask for a blacklist or fee burn. Confirm the studio rejects it and offers a supported variant.
4. Confirm a real Anthropic request appears in your account usage and no secret appears in the browser response or logs. With a daily budget below $0.05, free-form requests should return a budget error while the template still runs.
5. Confirm the report displays a pinned-fork result and Mainnet launch locked. A valid key does not enable wallet submission.
