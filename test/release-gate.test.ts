import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checks, previewGate, releaseGate } from '../release-gate.ts';
import { signApproval } from '../attester.ts';

test('preview gate fails every check and never allows progress', () => {
  assert.equal(previewGate().allowed, false);
  assert.equal(previewGate().checks.filter(check => check.passed).length, 0);
});
test('gate rejects mismatched and expired evidence', () => {
  const evidence = Object.fromEntries(Object.keys(checks).map(key => [key,
    { release: 'release', reference: 'reference', validUntil: 101 }]));
  assert.equal(releaseGate('release', evidence, 100).allowed, true);
  assert.equal(releaseGate('other', evidence, 100).allowed, false);
  assert.equal(releaseGate('release', evidence, 101).allowed, false);
  assert.equal(releaseGate('release', { ...evidence, independentReview: undefined }, 100).allowed, false);
});
test('external signer receives only the digest', async () => {
  const digest = ('0x' + '11'.repeat(32)) as `0x${string}`;
  assert.equal(await signApproval(digest, '0x1111111111111111111111111111111111111111', async hash => {
    assert.equal(hash, digest);
    return '0xab';
  }), '0xab');
});
