'use client';

import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { MainNav, useHashRoute } from '../components/MainNav';
import { DashboardView } from '../components/DashboardView';
import { ActionsView } from '../components/ActionsView';
import { LiquidatePanel } from '../components/LiquidatePanel';
import { HistoryView } from '../components/HistoryView';

export default function Home() {
  const { view, action, setRoute } = useHashRoute();

  return (
    <main className="max-w-4xl mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Image
            src="/logo.png"
            alt="OpenLend"
            width={400}
            height={120}
            priority
            className="h-8 sm:h-10 w-auto"
          />
        </div>
        <div className="self-start sm:self-auto">
          <ConnectButton />
        </div>
      </header>

      <ConnectGate>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MainNav active={view} onChange={(v) => setRoute(v)} />
          <span className="hidden text-xs text-zinc-500 sm:inline">
            Single-asset borrow/lend on IOPN testnet
          </span>
        </div>

        {view === 'dashboard' && <DashboardView />}
        {view === 'actions' && (
          <ActionsView
            action={action}
            onChange={(k) => setRoute('actions', k)}
          />
        )}
        {view === 'liquidate' && <LiquidatePanel />}
        {view === 'history' && <HistoryView />}
      </ConnectGate>
    </main>
  );
}
