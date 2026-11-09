import { concatHex, encodeAbiParameters, getCreate2Address, keccak256, toHex } from 'viem';
import type { Address, Hex } from 'viem';
import { specSchema } from './spec.ts';

export function compileHook(bytecode: Hex, factory: Address, manager: Address, token: Address, raw: unknown, creator: Address = factory, router: Address = factory) {
  const spec = specSchema.parse(raw);
  const args = encodeAbiParameters([
    { type: 'address' }, { type: 'address' }, { type: 'tuple', components: [
      { name: 'buyBps', type: 'uint16' }, { name: 'sellBps', type: 'uint16' },
      { name: 'openingBuyBps', type: 'uint16' }, { name: 'openingSellBps', type: 'uint16' },
      { name: 'windowSeconds', type: 'uint32' }, { name: 'triggerSellBps', type: 'uint16' }, { name: 'triggerSeconds', type: 'uint32' },
    ] }, { type: 'address' }, { type: 'address' },
  ], [manager, token, spec, creator, router]);
  const initCode = concatHex([bytecode, args]);
  const bytecodeHash = keccak256(initCode);
  for (let nonce = 0; nonce < 262144; nonce++) {
    const salt = toHex(nonce, { size: 32 });
    const address = getCreate2Address({ from: factory, salt, bytecodeHash });
    if ((BigInt(address) & 0x3fffn) === 0x2080n) return { address, salt, initCode, bytecodeHash };
  }
  throw new Error('Could not find a beforeInitialize and beforeSwap address within the mining limit.');
}
