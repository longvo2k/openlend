'use client';

import { ReactNode } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { iopnTestnet } from '../lib/chains';

interface Props {
  children: ReactNode;
}

export function ConnectGate({ children }: Props) {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain, isPending: switching } = useSwitchChain();

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center">
        <p className="text-zinc-400 mb-4">Connect a wallet to use OpenLend.</p>
        <div className="inline-block">
          <ConnectButton />
        </div>
      </div>
    );
  }

  if (chainId !== iopnTestnet.id && chainId !== 31337) {
    return (
      <div className="rounded-xl border border-amber-700 bg-amber-950/40 p-8 text-center">
        <p className="text-amber-200 mb-4">
          Wrong network. OpenLend lives on IOPN Testnet (chainId 984).
        </p>
        <button
          onClick={() => switchChain({ chainId: iopnTestnet.id })}
          disabled={switching}
          className="rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-medium px-4 py-2"
        >
          {switching ? 'Switching…' : 'Switch to IOPN Testnet'}
        </button>
      </div>
    );
  }

  return <>{children}</>;
}
