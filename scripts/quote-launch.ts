import { createPublicClient, http, isAddress, isHex } from 'viem';
import { quoteApprovedCall } from '../quote.ts';

try {
  const { REPLAY_FACTORY: factory, REPLAY_CREATOR: creator, REPLAY_CALLDATA: data,
    REPLAY_CHAIN_ID: chain, REPLAY_FUNDING_WEI: value, REPLAY_LOCKED_SEED_WEI: seed, REPLAY_RPC: rpc } = process.env;
  if (!factory || !isAddress(factory) || !creator || !isAddress(creator) || !data ||
      !isHex(data, { strict: true }) || !chain || !value || !seed || !rpc) throw Error('Missing exact call or measured seed.');
  const quote = await quoteApprovedCall(createPublicClient({ transport: http(rpc, { timeout: 8000, retryCount: 0 }) }),
    { chainId: Number(chain), factory, creator, data, value: BigInt(value), lockedSeed: BigInt(seed) });
  console.log(JSON.stringify(quote, null, 2));
} catch {
  console.error('Quote unavailable. Verify the exact approved call, RPC posting estimate and HYPE spot price. Launches remain locked.');
  process.exitCode = 1;
}
