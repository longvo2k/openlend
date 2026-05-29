import LendingPoolJson from './abi/LendingPool.json';

export const lendingPoolAbi = LendingPoolJson.abi;

type Hex = `0x${string}`;
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export const SUPPORTED_CHAIN_IDS = [984, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

/**
 * Resolve the LendingPool address per chain.
 *
 * Source of truth:
 *   - IOPN testnet (984)   → NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET
 *   - Local hardhat (31337) → NEXT_PUBLIC_LENDING_POOL_ADDRESS_LOCAL
 *
 * Set these in `.env.local` for dev or in Vercel project settings for prod.
 * Returns null when the env var is missing or malformed — the UI surfaces
 * a "no deployment found" message in that case.
 */
export function getLendingPoolAddress(chainId: number): Hex | null {
  const raw =
    chainId === 984
      ? process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET
      : chainId === 31337
      ? process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS_LOCAL
      : undefined;
  if (raw && ADDRESS_RE.test(raw)) return raw as Hex;
  return null;
}
