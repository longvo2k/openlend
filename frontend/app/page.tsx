'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { Sidebar } from '../components/Sidebar';
import { useHashRoute, sectionOf } from '../lib/route';

import { DashboardView } from '../components/DashboardView';
import { ActionPanel } from '../components/ActionPanel';
import { LiquidatePanel } from '../components/LiquidatePanel';
import { HistoryView } from '../components/HistoryView';

import { SwapPoolStats } from '../components/swap/SwapPoolStats';
import { SwapPanel } from '../components/swap/SwapPanel';
import { LiquidityPanel } from '../components/swap/LiquidityPanel';
import { FaucetPanel } from '../components/swap/FaucetPanel';

import { LeveragedLPPanel } from '../components/strategy/LeveragedLPPanel';

export default function Home() {
  const { route, setRoute } = useHashRoute();

  return (
    <div className="flex min-h-screen">
      <Sidebar route={route} onChange={setRoute} />

      <main className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-950/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="w-9 md:hidden" aria-hidden />
          <div className="text-sm text-zinc-400 truncate">{labelFor(route)}</div>
          <ConnectButton />
        </header>

        <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-4xl">
          <ConnectGate>{renderRoute(route)}</ConnectGate>
        </div>
      </main>
    </div>
  );
}

function renderRoute(route: ReturnType<typeof useHashRoute>['route']) {
  switch (route) {
    case 'lend:dashboard':
      return <DashboardView />;
    case 'lend:supply':
      return <SinglePanel><ActionPanel kind="supply" /></SinglePanel>;
    case 'lend:withdraw':
      return <SinglePanel><ActionPanel kind="withdraw" /></SinglePanel>;
    case 'lend:borrow':
      return <SinglePanel><ActionPanel kind="borrow" /></SinglePanel>;
    case 'lend:repay':
      return <SinglePanel><ActionPanel kind="repay" /></SinglePanel>;
    case 'lend:liquidate':
      return <LiquidatePanel />;
    case 'lend:history':
      return <HistoryView />;
    case 'swap:swap':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SwapPoolStats />
          <SinglePanel><SwapPanel /></SinglePanel>
        </div>
      );
    case 'swap:liquidity':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SwapPoolStats />
          <SinglePanel><LiquidityPanel /></SinglePanel>
        </div>
      );
    case 'swap:faucet':
      return (
        <div className="space-y-4 sm:space-y-6">
          <SinglePanel><FaucetPanel /></SinglePanel>
        </div>
      );
    case 'strategy:leveraged-lp':
      return <SinglePanel><LeveragedLPPanel /></SinglePanel>;
  }
}

function SinglePanel({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg">{children}</div>;
}

function labelFor(route: ReturnType<typeof useHashRoute>['route']): string {
  const section = sectionOf(route);
  const sectionName =
    section === 'lend' ? 'OpenLend' : section === 'swap' ? 'OpenSwap' : 'Strategy';
  const page = route.split(':')[1].replace(/^./, (c) => c.toUpperCase());
  return `${sectionName} · ${page}`;
}
