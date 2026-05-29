import lendingPoolArtifact from '@root/artifacts/contracts/LendingPool.sol/LendingPool.json';

export const lendingPoolAbi = lendingPoolArtifact.abi;

type DeploymentRecord = { lendingPool: `0x${string}`; chainId: number };

export const SUPPORTED_CHAIN_IDS = [984, 31337] as const;
export type SupportedChainId = (typeof SUPPORTED_CHAIN_IDS)[number];

export function getLendingPoolAddress(chainId: number): `0x${string}` | null {
  try {
    if (chainId === 984) {
      const d = require('@root/deployments/iopnTestnet.json') as DeploymentRecord;
      return d.lendingPool;
    }
    if (chainId === 31337) {
      const d = require('@root/deployments/hardhat.json') as DeploymentRecord;
      return d.lendingPool;
    }
  } catch {
    return null;
  }
  return null;
}
