import LendingPoolJson from './abi/LendingPool.json';
import OpenSwapPairJson from './abi/OpenSwapPair.json';
import MockUSDCJson from './abi/MockUSDC.json';

export const lendingPoolAbi = LendingPoolJson.abi;
export const openSwapPairAbi = OpenSwapPairJson.abi;
export const mockUSDCAbi = MockUSDCJson.abi;

type Hex = `0x${string}`;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const SUPPORTED_CHAIN_IDS = [984, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * Per-chain address loaders.
 *
 * IMPORTANT: Each `process.env.NEXT_PUBLIC_X` access below MUST be a static
 * member-expression literal. Next.js only inlines static references at
 * build/dev time — `process.env[varName]` with a variable returns
 * `undefined` in the browser bundle. Do not refactor these into a helper
 * that takes the key as a string parameter.
 */

function check(raw: string | undefined): Hex | null {
  if (raw && ADDRESS_RE.test(raw)) return raw as Hex;
  return null;
}

export function getLendingPoolAddress(chainId: number): Hex | null {
  if (chainId === 984) return check(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET);
  if (chainId === 31337) return check(process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS_LOCAL);
  return null;
}

export function getPairAddress(chainId: number): Hex | null {
  if (chainId === 984) return check(process.env.NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET);
  if (chainId === 31337) return check(process.env.NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL);
  return null;
}

export function getMockUSDCAddress(chainId: number): Hex | null {
  if (chainId === 984) return check(process.env.NEXT_PUBLIC_MOCK_USDC_TESTNET);
  if (chainId === 31337) return check(process.env.NEXT_PUBLIC_MOCK_USDC_LOCAL);
  return null;
}
