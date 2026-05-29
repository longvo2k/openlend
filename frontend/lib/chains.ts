import { defineChain } from 'viem';

export const iopnTestnet = defineChain({
  id: 984,
  name: 'IOPN Testnet',
  nativeCurrency: { name: 'OPN', symbol: 'OPN', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.iopn.tech'] },
  },
  blockExplorers: {
    default: { name: 'IOPN Explorer', url: 'https://testnet.iopn.tech' },
  },
  testnet: true,
});
