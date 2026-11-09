import { decodeFunctionResult, encodeFunctionData, formatEther, keccak256, parseAbi } from 'viem';
import type { Address, Hex, PublicClient } from 'viem';

const abi = parseAbi([
  'function gasEstimateComponents(address to, bool contractCreation, bytes data) payable returns (uint64 gasEstimate, uint64 gasEstimateForL1, uint256 baseFee, uint256 l1BaseFeeEstimate)',
]);

export async function hypeSpot() {
  const response = await fetch('https://api.hyperliquid.xyz/info', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'allMids' }), signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) throw Error('HYPE spot price is unavailable.');
  const book = await response.json() as Record<string, unknown>;
  const midpoint = Number(book['@107']);
  if (!Number.isFinite(midpoint) || midpoint <= 0) throw Error('HYPE spot price is unavailable.');
  return midpoint;
}

export async function quoteApprovedCall(client: Pick<PublicClient, 'call' | 'getChainId'>, input: {
  chainId: number; factory: Address; creator: Address; data: Hex; value: bigint; lockedSeed: bigint;
}, spot = hypeSpot) {
  if (await client.getChainId() !== input.chainId) throw Error('The quote RPC is on the wrong chain.');
  if (input.lockedSeed <= 0n || input.lockedSeed > input.value) throw Error('The measured locked seed is invalid.');
  let totalGas: bigint;
  let postingGas: bigint;
  let baseFee: bigint;
  try {
    const result = await client.call({
      account: input.creator, to: '0x00000000000000000000000000000000000000C8', value: input.value,
      data: encodeFunctionData({ abi, functionName: 'gasEstimateComponents', args: [input.factory, false, input.data] }),
    });
    [totalGas, postingGas, baseFee] = decodeFunctionResult({
      abi, functionName: 'gasEstimateComponents', data: result.data ?? '0x',
    });
    if (totalGas <= 0n || postingGas > totalGas || baseFee <= 0n) throw Error();
  } catch {
    throw Error('Execution and rollup posting costs could not be estimated for this call.');
  }
  const price = await spot();
  if (!Number.isFinite(price) || price <= 0) throw Error('HYPE spot price is unavailable.');
  const amount = (wei: bigint) => {
    const hype = formatEther(wei);
    return { hype, usd: Number(hype) * price };
  };
  const quotedAt = Date.now();
  return {
    chainId: input.chainId, factory: input.factory, creator: input.creator, calldataHash: keccak256(input.data),
    fundingHype: formatEther(input.value), quotedAt, validUntil: quotedAt + 30_000, hypeUsdc: price,
    execution: amount((totalGas - postingGas) * baseFee),
    posting: amount(postingGas * baseFee),
    transaction: amount(totalGas * baseFee),
    lockedSeed: amount(input.lockedSeed),
    combined: amount(input.lockedSeed + totalGas * baseFee),
  };
}
