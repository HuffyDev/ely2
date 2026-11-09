import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { keccak256, toHex } from 'viem';

async function withServer(operator: boolean, run: (base: string, token: string) => Promise<void>) {
  const socket = createServer();
  await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve));
  const { port } = socket.address() as { port: number };
  await new Promise<void>(resolve => socket.close(() => resolve()));
  const directory = await mkdtemp(join(tmpdir(), 'hook-preview-'));
  const token = 'operator-test-token-never-public-012345';
  const child = spawn(process.execPath, ['server.ts'], { env: { ...process.env,
    PORT: String(port), HOOK_OPERATOR_MODE: operator ? '1' : '0', HOOK_OPERATOR_TOKEN: token,
    HOOK_DB_PATH: join(directory, 'test.sqlite'), ANTHROPIC_API_KEY: 'secret-test-value',
  }, stdio: ['ignore', 'pipe', 'ignore'] });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  try {
    await Promise.race([
      new Promise<void>(resolve => child.stdout.once('data', () => resolve())),
      exited.then(() => { throw Error('Preview server exited before starting'); }),
    ]);
    await run('http://127.0.0.1:' + port, token);
  } finally {
    child.kill();
    await exited;
    await rm(directory, { recursive: true, force: true });
  }
}

test('public preview exposes real evidence and no secrets or execution endpoints', async () => {
  await withServer(false, async (base, token) => {
    const page = await (await fetch(base)).text();
    assert.match(page, /Preview: launches locked/);
    assert.doesNotMatch(page, /secret-test-value|operator-test-token/);
    const report = await (await fetch(base + '/demo-report.json')).json();
    const { id, spec, launch, simulation } = report;
    assert.equal(simulation.block, '3122111');
    assert.equal(simulation.status, 'passed');
    assert.equal(report.reportHash, keccak256(toHex(JSON.stringify({ id, spec, launch, simulation }))));
    assert.equal(report.launchReady, false);
    assert.equal((await fetch(base + '/api/draft', { method: 'POST', headers: { authorization: 'Bearer ' + token } })).status, 403);
    assert.equal((await fetch(base + '/api/launch', { method: 'POST' })).status, 423);
    for (const path of ['/.env', '/server.ts', '/attester.ts', '/hook.sqlite', '/api/sign', '/api/reports/' + id]) {
      assert.equal((await fetch(base + path)).status, 404);
    }
  });
});

test('operator mode authenticates before applying the shared request cap', async () => {
  await withServer(true, async (base, token) => {
    const post = (authorization = '', body = '{}') => fetch(base + '/api/draft', { method: 'POST',
      headers: { authorization, 'content-type': 'application/json' }, body });
    assert.equal((await post('Bearer invalid')).status, 401);
    assert.equal((await post('Bearer ' + token)).status, 400);
    assert.equal((await post('Bearer ' + token)).status, 400);
    assert.equal((await post('Bearer ' + token)).status, 429);
  });
});
