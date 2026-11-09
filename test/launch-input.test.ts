import { test } from 'node:test';
import assert from 'node:assert/strict';
import { launchInput } from '../launch-input.ts';

const draft = {
  creator: '0x1111111111111111111111111111111111111111', name: 'Exact Seed', symbol: 'EXACT',
  tokenSalt: '0x' + 'aa'.repeat(32), funding: '50000000000000000000', liquidity: '50000000000000000000',
  initialTick: 0, creatorAllocation: '0',
};

test('validates configurable funding and liquidity without rounding', () => {
  assert.deepEqual(launchInput.parse(draft), draft);
  for (const invalid of [{ funding: '99999999999999999' }, { funding: '1e18' },
    { liquidity: '0' }, { initialTick: 887220 }, { creator: '0x' + '0'.repeat(40) },
    { tokenSalt: '0xaa' }, { creatorAllocation: '100000000000000000000000001' }]) {
    assert.equal(launchInput.safeParse({ ...draft, ...invalid }).success, false);
  }
});
