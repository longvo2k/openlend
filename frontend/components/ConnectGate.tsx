'use client';

import { ReactNode } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { iopnTestnet } from '../lib/chains';
import { DisconnectedHero } from './DisconnectedHero';
import { WrongNetworkHero } from './WrongNetworkHero';

interface Props {
  children: ReactNode;
}

export function ConnectGate({ children }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();

  if (!isConnected) return <DisconnectedHero />;
  if (chainId !== iopnTestnet.id && chainId !== 31337) return <WrongNetworkHero />;

  return <>{children}</>;
}
