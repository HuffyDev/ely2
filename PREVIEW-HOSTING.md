# Publish the locked preview

## Public site

Use the existing Replit project and publish it as a **Static Deployment**. Set the public directory to `public`. Leave the build command empty. The site is plain HTML, CSS, JS and two JSON files. No Node server, RPC, Foundry, database, environment variables, or secrets are required.

The creator-wallet demo shows a saved execution report from Elysium chain 99901, fork block **3,122,111**. It records ten successful holder round trips in a simulation. Its hash is checked in the test suite. There is no wallet integration, transaction builder, or live Claude request in the public site. Publish only `public`, never the repository root. If using GitHub Pages for a project subpath, change asset URLs to be relative first. Replit serves this layout at the domain root.

If you prefer to use the Node server, run `npm ci` then `npm start` with Node 24. It defaults to the same saved preview on port 3000. Set `PORT` only if your host requires it. The server ignores Claude credentials unless operator mode is explicitly configured, uses an in-memory database in preview mode, rejects drafting with HTTP 403 and rejects launch submission with HTTP 423. A static deployment has no API routes at all.

## Private live rehearsal

Run it locally for the simplest setup, or use a single private VM with Node 24, Foundry, a writable durable SQLite volume, HTTPS or private networking, and outbound access to an archive-capable Elysium RPC. A Replit Reserved VM supplies dedicated compute. Verify the durability of the database volume before using any hosted VM for paid drafting. If you cannot supply durable single-instance storage, keep live drafting local. Do not use autoscaling or multiple replicas with separate SQLite files.

The server executes Foundry on the host. The RPC must support historical state reads at the pinned block. Neither credential belongs in the browser. Use provider-side RPC quotas as a second limit, since each rehearsal can make multiple RPC reads. The RPC needs read access only. No deployer or attester key is required for this path.

In your ignored local `.env` or private VM secret store, set:

| Variable | Value |
|---|---|
| `HOOK_OPERATOR_MODE` | `1` |
| `HOOK_OPERATOR_TOKEN` | Random operator-only secret of at least 32 characters. The operator API expects `Authorization: Bearer <token>`. |
| `HOOK_DB_PATH` | Path on the durable volume. Defaults to `hook.sqlite` locally. Keep the same file across restarts. |
| `HOOK_FORGE_BIN` | Path to the Forge executable if it is unavailable on PATH. |
| `HOOK_FORK_RPC` | Read-only archival Elysium RPC supporting historical block 3122111. |
| `HOOK_FORK_BLOCK` | `3122111` |
| `HOOK_FORK_MANAGER` | `0xe2e105d3f7209a9da11f83ccf3e7398a753823f1` |
| `ANTHROPIC_API_KEY` | Optional, only for free-form drafting. |
| `HOOK_DAILY_BUDGET_USD` | Defaults to `1`. Use `0` to disable paid calls. |
| `PORT` | Optional. Defaults to `3000`. |

The shared operator limit is **2 requests per UTC minute and 20 per UTC day**, counted in SQLite before parsing a draft. Forge runs one rehearsal at a time per process. The Claude budget reserves **$0.05 before dispatch**, including failed calls, and is not shared across different database files. No public visitor can use either allowance. For the Claude smoke test, start the private server, then run `npm run check:claude` locally with the same .env. The public web page always shows the saved demo. Private report reads require the operator token and the API does not serve source files, databases, or environment files.
