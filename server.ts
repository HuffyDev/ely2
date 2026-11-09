import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { launchInput } from './launch-input.ts';
import { keccak256, toHex } from 'viem';
import { estimateLockedSeed } from './cost.ts';
import { previewGate } from './release-gate.ts';
import { recordedReview } from './review-record.ts';
import { simulate } from './simulation.ts';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { draftWithClaude, modelResponse } from './claude.ts';
import { z } from 'zod';
import { measure, specSchema, templates } from './spec.ts';

const operatorToken = process.env.HOOK_OPERATOR_TOKEN;
const operatorMode = process.env.HOOK_OPERATOR_MODE === '1' && Boolean(operatorToken && operatorToken.length >= 32);
const digest = (value: string) => createHash('sha256').update(value).digest();
const expectedToken = operatorMode ? digest('Bearer ' + operatorToken) : undefined;
const authorized = (header?: string) => Boolean(expectedToken && header && timingSafeEqual(digest(header), expectedToken));
const db = new DatabaseSync(operatorMode ? (process.env.HOOK_DB_PATH ?? 'hook.sqlite') : ':memory:');
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, data TEXT); CREATE TABLE IF NOT EXISTS budget (day TEXT PRIMARY KEY, micros INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS throttle (slot TEXT PRIMARY KEY, hits INTEGER NOT NULL)');
const reserve = db.prepare('INSERT INTO budget VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET micros = micros + excluded.micros WHERE micros + excluded.micros <= ?');
const limit = Math.floor(Number(process.env.HOOK_DAILY_BUDGET_USD ?? 1) * 1_000_000);
const key = operatorMode ? process.env.ANTHROPIC_API_KEY : undefined;
const hit = db.prepare('INSERT INTO throttle VALUES (?, 1) ON CONFLICT(slot) DO UPDATE SET hits = hits + 1 WHERE hits < ?');
const prune = db.prepare('DELETE FROM throttle WHERE slot < ?');
function throttle() {
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const minute = now.slice(0, 16);
  db.exec('BEGIN IMMEDIATE');
  try {
    prune.run(day);
    const allowed = hit.run(minute, 2).changes && hit.run(day, 20).changes;
    db.exec(allowed ? 'COMMIT' : 'ROLLBACK');
    return Boolean(allowed);
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const claude = key ? new Anthropic({ apiKey: key, maxRetries: 0, timeout: 20000 }) : undefined;
const assets: Record<string, [string, string]> = {
  '/demo-report.json': ['demo-report.json', 'application/json'], '/templates.json': ['templates.json', 'application/json'],
  '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/style.css': ['style.css', 'text/css'],
};
class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'");
  const send = (code: number, data: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  };
  try {
    const path = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (path === '/api/launch') {
      const gate = previewGate(authorized(req.headers.authorization) ? recordedReview() : undefined);
      return send(req.method === 'GET' ? 200 : 423, { ...gate, error: 'Preview: launches locked.' });
    }
    if (req.method === 'GET') {
      if (path === '/api/library') return send(200, { templates, ai: Boolean(claude) });
      if (/^\/api\/reports\/[a-f0-9-]{36}$/.test(path)) {
        if (!authorized(req.headers.authorization)) return send(404, { error: 'Report unavailable.' });
        const row = db.prepare('SELECT data FROM reports WHERE id = ?').get(path.split('/').at(-1)!) as { data: string } | undefined;
        return row ? send(200, JSON.parse(row.data)) : send(404, { error: 'Report unavailable.' });
      }
      if (Object.hasOwn(assets, path)) {
        const [file, mime] = assets[path];
        res.writeHead(200, { 'Content-Type': mime + '; charset=utf-8' });
        return res.end(readFileSync(new URL('./public/' + file, import.meta.url)));
      }
    }
    if (req.method === 'POST' && path === '/api/draft') {
      if (!operatorMode) return send(403, { error: 'Saved reports only in public preview.' });
      if (!authorized(req.headers.authorization)) return send(401, { error: 'Operator access required.' });
      if (!throttle()) return send(429, { error: 'Operator rehearsal limit reached. Try again later.' });
      if (req.headers['sec-fetch-site'] === 'cross-site' || req.headers['content-type'] !== 'application/json') throw new RequestError(415, 'Use a same-site JSON request.');
      let bytes = 0;
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 12000) throw new RequestError(413, 'Request too large.');
        chunks.push(chunk);
      }
      let input: unknown;
      try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new RequestError(400, 'Invalid JSON.'); }
      const draft = z.strictObject({ prompt: z.string().trim().min(1).max(1500), launch: launchInput.optional() }).safeParse(input);
      if (!draft.success) throw new RequestError(400, 'Check the behaviour and launch parameters.');
      const prompt = draft.data.prompt;
      const preset = templates.find(t => t.text === prompt);
      let result: z.infer<typeof modelResponse> = { supported: true, explanation: '', spec: templates[0].spec };
      if (preset) result.spec = preset.spec;
      else {
        if (!claude) throw new RequestError(503, 'Claude is offline. Try a library template.');
        const reservation = 50_000;
        if (!Number.isSafeInteger(limit) || limit < reservation ||
            !reserve.run(new Date().toISOString().slice(0, 10), reservation, limit).changes) {
          throw new RequestError(429, 'The daily AI budget is exhausted.');
        }
        result = await draftWithClaude(claude, prompt);
      }
      if (!result.supported) return send(422, { error: result.explanation });
      const id = randomUUID();
      const spec = specSchema.parse(result.spec);
      const launch = draft.data.launch ?? null;
      const simulation = await simulate(spec, launch ?? undefined);
      const evidence = { id, spec, launch, simulation };
      const reportHash = keccak256(toHex(JSON.stringify(evidence)));
      const cost = simulation.nativeSeedWei ? await estimateLockedSeed(simulation.nativeSeedWei) : null;
      const report = { ...evidence, reportHash, cost, checks: measure(spec), launchReady: previewGate().allowed, source: preset ? 'Library template' : 'Claude Sonnet 5.5' };
      db.prepare('INSERT INTO reports VALUES (?, ?)').run(id, JSON.stringify(report));
      return send(201, report);
    }
    return send(404, { error: 'Page unavailable.' });
  } catch (error) {
    if (error instanceof RequestError) return send(error.status, { error: error.message });
    return send(502, { error: 'The draft could not be completed. No launch was authorized.' });
  }
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0', () => console.log('HOOK Studio is listening.'));
