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
 * Per-chain address loaders. All three contracts come from a single
 * `deployments/<network>.json` written by `scripts/deploy.ts`. For the
 * frontend they are exposed as env vars (per chain) via `.env.local`.
 * Each loader returns `null` when its var is missing so the UI can
 * surface a "no deployment found" hint instead of crashing.
 */

function fromEnv(chainId: number, testnetKey: string, localKey: string): Hex | null {
  const raw =
    chainId === 984
      ? process.env[testnetKey]
      : chainId === 31337
      ? process.env[localKey]
      : undefined;
  if (raw && ADDRESS_RE.test(raw)) return raw as Hex;
  return null;
}

export function getLendingPoolAddress(chainId: number): Hex | null {
  return fromEnv(
    chainId,
    'NEXT_PUBLIC_LENDING_POOL_ADDRESS_TESTNET',
    'NEXT_PUBLIC_LENDING_POOL_ADDRESS_LOCAL',
  );
}

export function getPairAddress(chainId: number): Hex | null {
  return fromEnv(
    chainId,
    'NEXT_PUBLIC_OPENSWAP_PAIR_TESTNET',
    'NEXT_PUBLIC_OPENSWAP_PAIR_LOCAL',
  );
}

export function getMockUSDCAddress(chainId: number): Hex | null {
  return fromEnv(
    chainId,
    'NEXT_PUBLIC_MOCK_USDC_TESTNET',
    'NEXT_PUBLIC_MOCK_USDC_LOCAL',
  );
}
