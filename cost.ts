import { formatEther } from 'viem';

export async function estimateLockedSeed(seedWei: string) {
  const seedHype = formatEther(BigInt(seedWei));
  try {
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }), signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) throw Error();
    const book = await response.json() as Record<string, unknown>;
    const midpoint = Number(book['@107']);
    if (!Number.isFinite(midpoint) || midpoint <= 0) throw Error();
    return { seedHype, seedUsd: Number(seedHype) * midpoint, hypeUsdc: midpoint, asOf: new Date().toISOString() };
  } catch {
    return { seedHype, seedUsd: null, hypeUsdc: null, asOf: null };
  }
}
