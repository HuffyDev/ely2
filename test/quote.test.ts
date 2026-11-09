import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodeAbiParameters, parseAbiParameters } from 'viem';
import { quoteApprovedCall } from '../quote.ts';

const address = '0x1111111111111111111111111111111111111111' as const;
const input = { chainId: 99901, factory: address, creator: address, data: '0x1234' as const,
  value: 2n * 10n ** 18n, lockedSeed: 10n ** 18n };
const client = {
  getChainId: async () => 99901,
  call: async () => ({ data: encodeAbiParameters(parseAbiParameters('uint64, uint64, uint256, uint256'),
    [1000n, 100n, 10n ** 14n, 1n]) }),
};

test('separates execution, rollup posting and permanently locked seed', async () => {
  const quote = await quoteApprovedCall(client, input, async () => 50);
  assert.deepEqual(quote.execution, { hype: '0.09', usd: 4.5 });
  assert.deepEqual(quote.posting, { hype: '0.01', usd: 0.5 });
  assert.deepEqual(quote.lockedSeed, { hype: '1', usd: 50 });
  assert.equal(quote.combined.hype, '1.1');
});
test('blocks a wrong chain, missing estimate, or missing price', async () => {
  await assert.rejects(quoteApprovedCall({ ...client, getChainId: async () => 1 }, input), /wrong chain/);
  await assert.rejects(quoteApprovedCall({ ...client, call: async () => ({ data: '0x' }) }, input), /posting costs/);
  await assert.rejects(quoteApprovedCall(client, input, async () => NaN), /spot price/);
});
