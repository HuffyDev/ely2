import { isAddress, zeroAddress } from 'viem';
import { z } from 'zod';

function uint(max: bigint, min = 0n) {
  return z.string().refine(value => {
    if (!/^(0|[1-9][0-9]{0,38})$/.test(value)) return false;
    const number = BigInt(value);
    return number >= min && number <= max;
  });
}

export const launchInput = z.strictObject({
  creator: z.string().refine(value => isAddress(value) && value.toLowerCase() !== zeroAddress),
  name: z.string().trim().min(1).max(64),
  symbol: z.string().regex(/^[A-Z0-9]{1,12}$/),
  tokenSalt: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  liquidity: uint((1n << 127n) - 1n, 1n),
  initialTick: z.number().int().min(-887219).max(887219),
  creatorAllocation: uint(100_000_000n * 10n ** 18n),
  funding: uint(10n ** 27n, 10n ** 17n),
});
export type LaunchInput = z.infer<typeof launchInput>;
