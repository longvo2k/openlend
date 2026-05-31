'use client';

import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { Database } from 'lucide-react';
import { openSwapPairAbi, getPairAddress } from '../../lib/contract';
import { formatOPN, formatMUSDC, formatLP } from '../../lib/format';

export function SwapPoolStats() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pair = getPairAddress(chainId);

  const { data, isLoading } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
          {
            address: pair,
            abi: openSwapPairAbi,
            functionName: 'balanceOf',
            args: user ? [user] : undefined,
          },
        ]
      : [],
    query: {
      refetchInterval: 5000,
      enabled: Boolean(pair),
    },
  });

  const reservesTuple = data?.[0]?.result as
    | readonly [bigint, bigint, number]
    | undefined;
  const totalSupply = data?.[1]?.result as bigint | undefined;
  const userLP = data?.[2]?.result as bigint | undefined;

  const reserveOPN = reservesTuple?.[0];
  const reserveMUSDC = reservesTuple?.[1];

  // Spot price: mUSDC per 1 OPN, accounting for decimals (mUSDC 6, OPN 18).
  let priceText = '—';
  if (reserveOPN && reserveMUSDC && reserveOPN > 0n) {
    const priceWei = (reserveMUSDC * 10n ** 18n) / reserveOPN;
    priceText = formatMUSDC(priceWei);
  }

  // User share excluding the MINIMUM_LIQUIDITY lock at 0xdead.
  let sharePct = '—';
  if (totalSupply !== undefined && totalSupply > 0n && userLP !== undefined) {
    const pctBp = Number((userLP * 10000n) / totalSupply);
    sharePct = (pctBp / 100).toFixed(2);
  }

  if (!pair) {
    return (
      <Card>
        <Header />
        <p className="mt-4 text-sm text-zinc-900">
          No Swap deployment for chainId {chainId}. Run{' '}
          <code className="bg-zinc-100 px-1 rounded text-black">npm run deploy:testnet</code> from the repo root,
          then <code className="bg-zinc-100 px-1 rounded text-black">npm run sync:testnet</code> in this folder.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />
      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="OPN reserves" value={isLoading ? '…' : `${formatOPN(reserveOPN)} OPN`} />
        <Stat label="mUSDC reserves" value={isLoading ? '…' : `${formatMUSDC(reserveMUSDC)} mUSDC`} />
        <Stat label="Spot price" value={isLoading ? '…' : `${priceText} mUSDC/OPN`} />
        <Stat label="Your LP share" value={isLoading ? '…' : `${sharePct}%`} />
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-700">
        <span>Total LP: {isLoading ? '…' : formatLP(totalSupply)}</span>
        <span>•</span>
        <span>Swap fee: 0.30%</span>
        <span>•</span>
        <span>Your LP: {isLoading ? '…' : formatLP(userLP)}</span>
      </div>
    </Card>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-6">
      {children}
    </section>
  );
}

function Header() {
  return (
    <header className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-black">
        <Database className="h-[18px] w-[18px]" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold">Pool</h2>
        <p className="mt-0.5 text-sm text-zinc-800">OPN / mUSDC constant-product AMM on IOPN testnet</p>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-700">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
