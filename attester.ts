import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, isHex, size, verifyMessage } from 'viem';
import type { Address, Hex } from 'viem';

export type ApprovalSigner = (hash: Hex) => Promise<Hex>;

// Explicit offline use only. The HTTP service does not import this module.
export async function signApproval(hash: Hex, expected: Address, external?: ApprovalSigner): Promise<Hex> {
  if (!isHex(hash, { strict: true }) || size(hash) !== 32) throw Error('Invalid approval digest.');
  if (external) return external(hash); // ERC-1271 validity must be checked by exact replay.
  try {
    const key = parseEnv(await readFile('.env', 'utf8')).HOOK_ATTESTER_KEY;
    if (!key || !isHex(key, { strict: true }) || size(key) !== 32) throw Error();
    const account = privateKeyToAccount(key);
    if (account.address !== getAddress(expected)) throw Error();
    const signature = await account.signMessage({ message: { raw: hash } });
    if (!(await verifyMessage({ address: account.address, message: { raw: hash }, signature }))) throw Error();
    return signature;
  } catch {
    throw Error('The local attester is unavailable or does not match the factory.');
  }
}
