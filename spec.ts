import { z } from 'zod';

const fee = z.number().int().min(0).max(500);
export const specSchema = z.strictObject({
  buyBps: fee,
  sellBps: fee,
  openingBuyBps: fee,
  openingSellBps: fee,
  windowSeconds: z.number().int().min(0).max(86400),
  triggerSellBps: fee,
  triggerSeconds: z.number().int().min(0).max(86400),
}).refine(s => s.windowSeconds > 0 || (s.openingBuyBps === 0 && s.openingSellBps === 0)).refine(s => s.triggerSeconds === 0 ? s.triggerSellBps === 0 : s.triggerSellBps > s.sellBps);

export type Spec = z.infer<typeof specSchema>;

export const templates = [
  { name: 'Registered wallet trigger', text: 'After a transfer out of the registered creator wallet, charge 5% on subsequent sells in the $HOOK pool for 30 minutes.', spec: { buyBps: 30, sellBps: 30, openingBuyBps: 0, openingSellBps: 0, windowSeconds: 0, triggerSellBps: 500, triggerSeconds: 1800 } },
  { name: 'Steady fees', text: 'Set a 0.3% fee on buys and sells.', spec: { buyBps: 30, sellBps: 30, openingBuyBps: 0, openingSellBps: 0, windowSeconds: 0, triggerSellBps: 0, triggerSeconds: 0 } },
  { name: 'Opening window', text: 'Charge 2% on sells for ten minutes, then 0.5%. Charge 0.3% on buys throughout.', spec: { buyBps: 30, sellBps: 50, openingBuyBps: 30, openingSellBps: 200, windowSeconds: 600, triggerSellBps: 0, triggerSeconds: 0 } },
  { name: 'Fee-free debut', text: 'Use no swap fees for the first hour, then 0.5% on buys and sells.', spec: { buyBps: 50, sellBps: 50, openingBuyBps: 0, openingSellBps: 0, windowSeconds: 3600, triggerSellBps: 0, triggerSeconds: 0 } },
];

export function feeAt(spec: Spec, sell: boolean, elapsed: number) {
  if (elapsed < spec.windowSeconds) return sell ? spec.openingSellBps : spec.openingBuyBps;
  return sell ? spec.sellBps : spec.buyBps;
}

export function measure(spec: Spec) {
  const times = [...new Set([0, ...[spec.windowSeconds, spec.triggerSeconds].flatMap(t => t ? [t - 1, t] : [])])].sort((a, b) => a - b);
  return times.map(seconds => ({ seconds, buy: feeAt(spec, false, seconds), sell: Math.max(feeAt(spec, true, seconds), seconds < spec.triggerSeconds ? spec.triggerSellBps : 0) }));
}
