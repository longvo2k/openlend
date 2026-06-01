'use client';

import { useState } from 'react';
import {
  useAccount,
  useChainId,
  useReadContract,
  useReadContracts,
} from 'wagmi';
import { maxUint256 } from 'viem';
import { Layers } from 'lucide-react';

import { TermHint } from '@/components/ui/TermHint';
import {
  getLendingPoolAddress,
  getPairAddress,
  lendingPoolAbi,
  openSwapPairAbi,
} from '@/lib/contract';
import { formatHF, formatLP, formatOPN } from '@/lib/format';
import { LIQUIDATION_THRESHOLD_BPS, Row } from './LeveragedLPShared';
import { OpenLeveragedLPForm } from './OpenLeveragedLPForm';
import { CloseLeveragedLPForm } from './CloseLeveragedLPForm';

type Mode = 'open' | 'close';

export function LeveragedLPPanel() {
  const [mode, setMode] = useState<Mode>('open');
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);
  const pair = getPairAddress(chainId);

  /* Position summary reads (shared between modes) */
  const { data: poolReads } = useReadContracts({
    contracts:
      pool && user
        ? [{ address: pool, abi: lendingPoolAbi, functionName: 'getAccountData', args: [user] }]
        : [],
    query: { enabled: Boolean(pool && user), refetchInterval: 5000 },
  });
  const account = poolReads?.[0]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
  const collateral = account?.[0] ?? 0n;
  const debt = account?.[1] ?? 0n;

  const { data: lpBalRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(pair && user), refetchInterval: 5000 },
  });
  const lpBalance = (lpBalRaw as bigint | undefined) ?? 0n;

  const hf =
    debt === 0n
      ? maxUint256
      : (collateral * BigInt(LIQUIDATION_THRESHOLD_BPS) * 10n ** 18n) / (debt * 10000n);
  const hfFmt = formatHF(hf);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-700'
      : hfFmt.tone === 'green'
      ? 'text-emerald-700'
      : 'text-zinc-900';

  const hasPosition = collateral > 0n || debt > 0n || lpBalance > 0n;

  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-6">
      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-black">
          <Layers className="h-5 w-5" aria-hidden />
        </div>
        <div className="flex-1">
          <h3 className="inline-flex items-center gap-1 text-lg font-semibold">
            <TermHint term="Leveraged LP">Leveraged LP</TermHint>
          </h3>
          <p className="text-sm text-zinc-800">
            Lock OPN as <TermHint term="Collateral">collateral</TermHint>, borrow OPN, pair with
            mUSDC, earn 0.30% <TermHint term="LP">LP</TermHint> fees on the borrowed capital.
            Close to unwind or rebalance partial.
          </p>
        </div>
      </header>

      {/* Mode toggle */}
      <div className="mb-4 inline-flex rounded-lg border border-zinc-300 bg-zinc-100 p-0.5 text-xs font-medium">
        <button
          type="button"
          onClick={() => setMode('open')}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === 'open' ? 'bg-white text-black shadow-sm' : 'text-zinc-700 hover:text-black'
          }`}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => setMode('close')}
          className={`rounded-md px-3 py-1.5 transition ${
            mode === 'close' ? 'bg-white text-black shadow-sm' : 'text-zinc-700 hover:text-black'
          }`}
        >
          Close / Rebalance
        </button>
      </div>

      {/* Current position summary */}
      {hasPosition && (
        <div className="mb-4 rounded-lg border border-zinc-300 bg-zinc-50 p-3 text-xs space-y-1">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-700">
            Current position
          </div>
          <Row
            label={<TermHint term="Collateral">Collateral</TermHint>}
            value={`${formatOPN(collateral)} OPN`}
          />
          <Row label="Debt" value={`${formatOPN(debt)} OPN`} />
          <Row
            label={<TermHint term="LP">LP</TermHint>}
            value={`${formatLP(lpBalance)} OSP-LP`}
          />
          <Row
            label={<TermHint term="Health factor">Health factor</TermHint>}
            value={hfFmt.text}
            valueClass={`font-semibold ${hfClass}`}
          />
        </div>
      )}

      {mode === 'open' ? <OpenLeveragedLPForm /> : <CloseLeveragedLPForm />}
    </section>
  );
}
