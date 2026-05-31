'use client';

import { ReactNode } from 'react';
import { useChainId } from 'wagmi';
import { iopnTestnet } from '../lib/chains';
import { WrongNetworkHero } from './WrongNetworkHero';

interface Props {
  children: ReactNode;
}

export function ConnectGate({ children }: Props) {
  const chainId = useChainId();

  if (chainId !== iopnTestnet.id && chainId !== 31337) return <WrongNetworkHero />;

  return <>{children}</>;
}
