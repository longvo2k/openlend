'use client';

import { useAccount, useChainId, useReadContracts } from 'wagmi';
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
        <p className="mt-4 text-sm text-amber-300/90">
          No OpenSwap deployment for chainId {chainId}. Run{' '}
          <code className="text-amber-200">npm run deploy:testnet</code> from the repo root,
          then <code className="text-amber-200">npm run sync:testnet</code> in this folder.
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
      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-500">
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
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/60 via-transparent to-transparent" />
      {children}
    </section>
  );
}

function Header() {
  return (
    <header className="flex items-start gap-3">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M7 7h10v10H7z" />
          <path d="M3 11l4-4M21 13l-4 4" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <h2 className="text-lg font-semibold">Pool</h2>
        <p className="mt-0.5 text-sm text-zinc-400">OPN / mUSDC constant-product AMM on IOPN testnet</p>
      </div>
    </header>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
