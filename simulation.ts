import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Spec } from './spec.ts';

const run = promisify(execFile);
let busy = false;

export async function simulate(spec: Spec) {
  if (busy) return { status: 'busy', reason: 'Another simulation is running. Retry shortly.' };
  const rpc = process.env.HOOK_FORK_RPC;
  const block = process.env.HOOK_FORK_BLOCK;
  const manager = process.env.HOOK_FORK_MANAGER;
  const fork = Boolean(rpc && /^\d+$/.test(block ?? '') && /^0x[0-9a-f]{40}$/i.test(manager ?? ''));
  if ((rpc || block || manager) && !fork) return { status: 'failed', reason: 'Fork settings are incomplete.' };
  const keys = ['PATH', 'Path', 'SystemRoot', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'TEMP', 'TMP'];
  const env = Object.fromEntries(keys.filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, {
    SIM_BUY: String(spec.buyBps), SIM_SELL: String(spec.sellBps),
    SIM_OPEN_BUY: String(spec.openingBuyBps), SIM_OPEN_SELL: String(spec.openingSellBps),
    SIM_WINDOW: String(spec.windowSeconds), SIM_TRIGGER_FEE: String(spec.triggerSellBps),
    SIM_TRIGGER_WINDOW: String(spec.triggerSeconds),
    ...(fork ? { HOOK_FORK_MANAGER: manager, ETH_RPC_URL: rpc } : {}),
  });
  busy = true;
  try {
    const { stdout } = await run(process.env.HOOK_FORGE_BIN || 'forge', [
      'test', '--match-contract', '^FactoryTest$', '--match-test', '^test_AtomicLaunchAndCreatorTrigger$', '-vv',
      ...(fork ? ['--fork-block-number', block!] : []),
    ], { env, timeout: 90000, windowsHide: true });
    const gas = stdout.match(/fixture launch execution gas:\s*(\d+)/)?.[1];
    const seed = stdout.match(/fixture native seed in wei:\s*(\d+)/)?.[1];
    if (!gas || !seed || !stdout.includes('[PASS] test_AtomicLaunchAndCreatorTrigger()')) throw Error();
    return { status: 'passed', environment: fork ? 'Pinned RPC fork' : 'Local v4 PoolManager', block: fork ? block : null,
      executionGas: Number(gas), nativeSeedWei: seed, roundTrips: 5 };
  } catch {
    return { status: 'failed', reason: 'Execution simulation could not be verified. Check Foundry and fork configuration.' };
  } finally {
    busy = false;
  }
}
