'use client';

import { SwapSubNav, type SwapView as SwapViewKind } from './MainNav';
import { SwapPoolStats } from './swap/SwapPoolStats';
import { SwapPanel } from './swap/SwapPanel';
import { LiquidityPanel } from './swap/LiquidityPanel';
import { FaucetPanel } from './swap/FaucetPanel';

interface Props {
  view: SwapViewKind;
  onChange: (v: SwapViewKind) => void;
}

export function SwapView({ view, onChange }: Props) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <SwapPoolStats />

      <SwapSubNav active={view} onChange={onChange} />

      <div className="max-w-lg">
        {view === 'swap' && <SwapPanel />}
        {view === 'liquidity' && <LiquidityPanel />}
        {view === 'faucet' && <FaucetPanel />}
      </div>
    </div>
  );
}
