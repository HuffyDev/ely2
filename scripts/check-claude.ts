import assert from 'node:assert/strict';
import { templates } from '../spec.ts';

if (!process.env.ANTHROPIC_API_KEY) throw Error('ANTHROPIC_API_KEY is not configured locally.');
const base = process.env.HOOK_CHECK_URL ?? 'http://localhost:3000';
if (!['127.0.0.1', 'localhost', '[::1]'].includes(new URL(base).hostname)) throw Error('Use a local studio URL.');
const send = (prompt: string) => fetch(base + '/api/draft', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
});
const prompt = 'For half an hour after the registered creator wallet sends tokens, charge five percent on later sells in the HOOK pool. The initiating sale may use the prior rate.';
assert.ok(!templates.some(template => template.text === prompt));
const response = await send(prompt);
assert.equal(response.status, 201);
const draft = await response.json();
assert.equal(draft.source, 'Claude Sonnet 5.5');
assert.equal(draft.spec.triggerSellBps, 500);
assert.equal(draft.spec.triggerSeconds, 1800);
const blacklist = await send('Blacklist a wallet and prevent it from selling.');
assert.equal(blacklist.status, 422);
const saved = await (await fetch(base + '/api/reports/' + draft.id)).json();
assert.equal(saved.simulation.status, 'passed');
assert.equal(saved.simulation.environment, 'Pinned RPC fork');
assert.equal(saved.simulation.chainId, '99901');
assert.equal(saved.launchReady, false);
const gate = await (await fetch(base + '/api/launch')).json();
assert.equal(gate.allowed, false);
console.log('Claude trigger, blacklist rejection, saved Elysium fork report and launch lock passed.');
