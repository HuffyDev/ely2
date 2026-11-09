import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { LaunchInput } from './launch-input.ts';
import type { Spec } from './spec.ts';

const run = promisify(execFile);
let busy = false;

export async function simulate(spec: Spec, launch?: LaunchInput) {
  if (busy) return { status: 'busy', reason: 'Another simulation is running. Retry shortly.' };
  const rpc = process.env.HOOK_FORK_RPC;
  const block = process.env.HOOK_FORK_BLOCK;
  const manager = process.env.HOOK_FORK_MANAGER;
  const fork = Boolean(rpc && /^\d+$/.test(block ?? '') && /^0x[0-9a-f]{40}$/i.test(manager ?? ''));
  if ((rpc || block || manager) && !fork) return { status: 'failed', reason: 'Fork settings are incomplete.' };
  const keys = ['PATH', 'Path', 'SystemRoot', 'USERPROFILE', 'HOME', 'LOCALAPPDATA', 'TEMP', 'TMP'];
  const env = Object.fromEntries(keys.filter(k => process.env[k]).map(k => [k, process.env[k]]));
  Object.assign(env, {
    SIM_DRAFT: 'true',
    ...(launch ? { SIM_CREATOR: launch.creator, SIM_NAME: launch.name, SIM_SYMBOL: launch.symbol,
      SIM_SALT: launch.tokenSalt, SIM_LIQUIDITY: launch.liquidity, SIM_TICK: String(launch.initialTick),
      SIM_ALLOCATION: launch.creatorAllocation, SIM_FUNDING: launch.funding } : {}),
    SIM_BUY: String(spec.buyBps), SIM_SELL: String(spec.sellBps),
    SIM_OPEN_BUY: String(spec.openingBuyBps), SIM_OPEN_SELL: String(spec.openingSellBps),
    SIM_WINDOW: String(spec.windowSeconds), SIM_TRIGGER_FEE: String(spec.triggerSellBps),
    SIM_TRIGGER_WINDOW: String(spec.triggerSeconds),
    ...(fork ? { HOOK_FORK_MANAGER: manager, HOOK_TEST_RPC: rpc, HOOK_TEST_BLOCK: block } : {}),
  });
  busy = true;
  try {
    const { stdout } = await run(process.env.HOOK_FORGE_BIN || 'forge', [
      'test', '--match-contract', '^FactoryTest$', '--match-test', '^test_AtomicLaunchAndCreatorTrigger', '-vv',
    ], { env, timeout: 90000, windowsHide: true });
    const gas = stdout.match(/fixture launch execution gas:\s*(\d+)/)?.[1];
    const seed = stdout.match(/fixture native seed in wei:\s*(\d+)/)?.[1];
    const hookSalt = stdout.match(/fixture hook salt:\s*(0x[0-9a-f]{64})/i)?.[1];
    const outputsWei = [...stdout.matchAll(/holder sell output in wei:\s*(\d+)/g)].map(match => match[1]);
    const read = (label: string) => stdout.match(new RegExp(label + ': (0x[0-9a-f]+)', 'i'))?.[1];
    const chainId = stdout.match(/simulation chain id: (\d+)/)?.[1];
    const deployment = {
      factory: read('simulation factory'), manager: read('simulation manager'),
      token: read('simulation token'), hook: read('simulation hook'),
      factoryCodeHash: read('simulation factory code hash'), managerCodeHash: read('simulation manager code hash'),
    };
    if (!chainId || Object.values(deployment).some(value => !value) || !gas || !seed || !hookSalt || outputsWei.length < 4 || !stdout.includes('[PASS] test_AtomicLaunchAndCreatorTrigger()')) throw Error();
    return { status: 'passed', environment: fork ? 'Pinned RPC fork' : 'Local v4 PoolManager', block: fork ? block : null,
      executionGas: Number(gas), nativeSeedWei: seed, roundTrips: outputsWei.length, outputsWei, hookSalt, chainId, deployment };
  } catch {
    return { status: 'failed', reason: 'Execution simulation could not be verified. Check Foundry and fork configuration.' };
  } finally {
    busy = false;
  }
}
