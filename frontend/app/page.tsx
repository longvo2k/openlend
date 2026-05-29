'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { PoolStats } from '../components/PoolStats';
import { AccountStats } from '../components/AccountStats';
import { ActionPanel } from '../components/ActionPanel';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">OpenLend</h1>
          <p className="text-sm text-zinc-400">Single-asset borrow/lend on IOPN testnet</p>
        </div>
        <ConnectButton />
      </header>

      <ConnectGate>
        <PoolStats />
        <AccountStats />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <ActionPanel kind="supply" />
          <ActionPanel kind="withdraw" />
          <ActionPanel kind="borrow" />
          <ActionPanel kind="repay" />
        </div>
      </ConnectGate>
    </main>
  );
}
