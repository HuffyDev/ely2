import { formatEther } from 'viem';
import { hypeSpot } from './quote.ts';

export async function estimateLockedSeed(seedWei: string) {
  const seedHype = formatEther(BigInt(seedWei));
  try {
    const midpoint = await hypeSpot();
    return { seedHype, seedUsd: Number(seedHype) * midpoint, hypeUsdc: midpoint, asOf: new Date().toISOString() };
  } catch {
    return { seedHype, seedUsd: null, hypeUsdc: null, asOf: null };
  }
}
