'use client';

import Image from 'next/image';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ConnectGate } from '../components/ConnectGate';
import { SectionNav, useHashRoute } from '../components/MainNav';
import { LendView } from '../components/LendView';
import { SwapView } from '../components/SwapView';

export default function Home() {
  const { section, lendView, swapView, action, setSection, setLendView, setSwapView } =
    useHashRoute();

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
          <SectionNav active={section} onChange={setSection} />
          <span className="hidden text-xs text-zinc-500 sm:inline">
            DeFi suite on IOPN testnet
          </span>
        </div>

        {section === 'lend' && (
          <LendView
            view={lendView}
            action={action}
            onViewChange={setLendView}
            onActionChange={(k) => setLendView('actions', k)}
          />
        )}
        {section === 'swap' && <SwapView view={swapView} onChange={setSwapView} />}
      </ConnectGate>
    </main>
  );
}
