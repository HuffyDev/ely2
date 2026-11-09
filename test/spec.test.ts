import { test } from 'node:test';
import assert from 'node:assert/strict';
import { specSchema, templates, measure } from '../spec.ts';
import { compileHook } from '../compile.ts';

test('rejects extra fields, disabled-window values and out-of-range fees', () => {
  const spec = templates[0].spec;
  for (const patch of [{ owner: '0x01' }, { openingBuyBps: 1 }, { sellBps: 501 }, { buyBps: -1 }, { windowSeconds: 86401 }, { buyBps: 2.5 }]) {
    assert.equal(specSchema.safeParse({ ...spec, ...patch }).success, false);
  }
});
test('opening window has an exclusive end', () => {
  assert.deepEqual(measure(templates[2].spec), [{ seconds: 0, buy: 30, sell: 200 }, { seconds: 599, buy: 30, sell: 200 }, { seconds: 600, buy: 30, sell: 50 }]);
});
test('mines precisely the required v4 hook flags', () => {
  const result = compileHook('0x6000', '0x0000000000000000000000000000000000000001', '0x0000000000000000000000000000000000000002', '0x0000000000000000000000000000000000000003', templates[0].spec);
  assert.equal(BigInt(result.address) & 0x3fffn, 0x2080n);
});
