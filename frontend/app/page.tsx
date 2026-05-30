'use client';

import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { PoolStats } from '../components/PoolStats';
import { AccountStats } from '../components/AccountStats';
import { ActionPanel } from '../components/ActionPanel';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Image
            src="/logo.png"
            alt="OpenLend"
            width={400}
            height={120}
            priority
            className="h-8 sm:h-10 w-auto"
          />
          <span className="hidden border-l border-zinc-800 pl-4 text-xs text-zinc-500 sm:inline">
            Single-asset borrow/lend on IOPN testnet
          </span>
        </div>
        <div className="self-start sm:self-auto">
          <ConnectButton />
        </div>
      </header>

      <ConnectGate>
        <PoolStats />
        <AccountStats />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <ActionPanel kind="supply" />
          <ActionPanel kind="withdraw" />
          <ActionPanel kind="borrow" />
          <ActionPanel kind="repay" />
        </div>
      </ConnectGate>
    </main>
  );
}
