'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount } from 'wagmi';
import { ConnectGate } from '../components/ConnectGate';
import { DisconnectedHero } from '../components/DisconnectedHero';
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
  const { isConnected } = useAccount();
  const { route, setRoute } = useHashRoute();

  if (!isConnected) {
    return (
      <div className="flex min-h-screen flex-col">
        <DisconnectedHero />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar route={route} onChange={setRoute} />

      <main className="flex min-h-screen flex-1 flex-col min-w-0">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-zinc-200 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
          <div className="w-9 md:hidden" aria-hidden />
          <div className="text-sm text-zinc-700 truncate">{labelFor(route)}</div>
          <ConnectButton />
        </header>

        <div className="flex flex-1 flex-col">
          <ConnectGate>{renderRoute(route)}</ConnectGate>
        </div>
      </main>
    </div>
  );
}

function ConnectedContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-5 sm:px-6 sm:py-6 max-w-4xl">{children}</div>
  );
}

function renderRoute(route: ReturnType<typeof useHashRoute>['route']) {
  switch (route) {
    case 'lend:dashboard':
      return <ConnectedContainer><DashboardView /></ConnectedContainer>;
    case 'lend:supply':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="supply" /></SinglePanel></ConnectedContainer>;
    case 'lend:withdraw':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="withdraw" /></SinglePanel></ConnectedContainer>;
    case 'lend:borrow':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="borrow" /></SinglePanel></ConnectedContainer>;
    case 'lend:repay':
      return <ConnectedContainer><SinglePanel><ActionPanel kind="repay" /></SinglePanel></ConnectedContainer>;
    case 'lend:liquidate':
      return <ConnectedContainer><LiquidatePanel /></ConnectedContainer>;
    case 'lend:history':
      return <ConnectedContainer><HistoryView /></ConnectedContainer>;
    case 'swap:swap':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SwapPoolStats />
            <SinglePanel><SwapPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'swap:liquidity':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SwapPoolStats />
            <SinglePanel><LiquidityPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'swap:faucet':
      return (
        <ConnectedContainer>
          <div className="space-y-4 sm:space-y-6">
            <SinglePanel><FaucetPanel /></SinglePanel>
          </div>
        </ConnectedContainer>
      );
    case 'strategy:leveraged-lp':
      return (
        <ConnectedContainer>
          <SinglePanel><LeveragedLPPanel /></SinglePanel>
        </ConnectedContainer>
      );
  }
}

function SinglePanel({ children }: { children: React.ReactNode }) {
  return <div className="max-w-lg">{children}</div>;
}

function labelFor(route: ReturnType<typeof useHashRoute>['route']): string {
  const section = sectionOf(route);
  const sectionName =
    section === 'lend' ? 'Lending' : section === 'swap' ? 'Trade' : 'Strategy';
  const page = route.split(':')[1].replace(/^./, (c) => c.toUpperCase());
  return `${sectionName} · ${page}`;
}
