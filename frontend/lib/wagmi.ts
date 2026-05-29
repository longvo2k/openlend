import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { hardhat } from 'wagmi/chains';
import { http } from 'viem';
import { iopnTestnet } from './chains';

const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? 'openlend-no-wc';

export const wagmiConfig = getDefaultConfig({
  appName: 'OpenLend',
  projectId,
  chains: [iopnTestnet, hardhat],
  transports: {
    [iopnTestnet.id]: http(),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
  ssr: true,
});
