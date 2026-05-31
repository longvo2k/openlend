'use client';

import { useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { ExternalLink, Plus } from 'lucide-react';
import {
  getMockUSDCAddress,
  getPairAddress,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import {
  formatLP,
  formatMUSDC,
  formatOPN,
  parseLP,
  parseMUSDC,
  parseOPN,
} from '../../lib/format';

type Mode = 'add' | 'remove';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN

function usdOfOPN(amountOPN: bigint, reserveOPN: bigint, reserveMUSDC: bigint): bigint {
  if (reserveOPN === 0n) return 0n;
  return (amountOPN * reserveMUSDC) / reserveOPN;
}

export function LiquidityPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [mode, setMode] = useState<Mode>('add');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  /* ----- Shared reads ----- */
  const { data: reservesData } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: { refetchInterval: 5000, enabled: Boolean(pair) },
  });
  const reserves = reservesData?.[0]?.result as readonly [bigint, bigint, number] | undefined;
  const totalSupply = reservesData?.[1]?.result as bigint | undefined;
  const reserveOPN = reserves?.[0];
  const reserveMUSDC = reserves?.[1];

  /* ----- Add mode state ----- */
  const [opnAmount, setOpnAmount] = useState('');
  const [musdcAmount, setMusdcAmount] = useState('');
  const [lastEdited, setLastEdited] = useState<'opn' | 'musdc'>('opn');

  const { data: balOPN } = useBalance({
    address: user,
    query: { enabled: Boolean(user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && mode === 'add'), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  // Auto-pair: when the pool has reserves, sync the other side to match the ratio.
  useEffect(() => {
    if (mode !== 'add') return;
    if (!reserveOPN || !reserveMUSDC || reserveOPN === 0n || reserveMUSDC === 0n) return;
    if (lastEdited === 'opn') {
      if (opnAmount === '') { setMusdcAmount(''); return; }
      try {
        const opn = parseOPN(opnAmount);
        const musdc = (opn * reserveMUSDC) / reserveOPN;
        setMusdcAmount(formatMUSDC(musdc, 6));
      } catch { /* invalid input */ }
    } else {
      if (musdcAmount === '') { setOpnAmount(''); return; }
      try {
        const musdc = parseMUSDC(musdcAmount);
        const opn = (musdc * reserveOPN) / reserveMUSDC;
        setOpnAmount(formatOPN(opn, 18));
      } catch { /* invalid input */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opnAmount, musdcAmount, lastEdited, reserveOPN, reserveMUSDC, mode]);

  const parsedOPN: bigint | null = useMemo(() => {
    try { return opnAmount ? parseOPN(opnAmount) : null; } catch { return null; }
  }, [opnAmount]);
  const parsedMUSDC: bigint | null = useMemo(() => {
    try { return musdcAmount ? parseMUSDC(musdcAmount) : null; } catch { return null; }
  }, [musdcAmount]);

  const { data: quoteAddRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: parsedOPN && parsedMUSDC ? [parsedOPN, parsedMUSDC] : undefined,
    query: {
      enabled: Boolean(pair && parsedOPN && parsedOPN > 0n && parsedMUSDC && parsedMUSDC > 0n),
      refetchInterval: 5000,
    },
  });
  const quotedLP = (quoteAddRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  /* ----- Remove mode state ----- */
  const [lpText, setLpText] = useState('');
  const { data: userLP } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(pair && user && mode === 'remove'), refetchInterval: 5000 },
  });
  const parsedLP: bigint | null = useMemo(() => {
    try { return lpText ? parseLP(lpText) : null; } catch { return null; }
  }, [lpText]);

  const removePreview = useMemo(() => {
    if (!parsedLP || !totalSupply || totalSupply === 0n || !reserveOPN || !reserveMUSDC) return null;
    return {
      opnOut: (parsedLP * reserveOPN) / totalSupply,
      mUSDCOut: (parsedLP * reserveMUSDC) / totalSupply,
    };
  }, [parsedLP, totalSupply, reserveOPN, reserveMUSDC]);

  /* ----- MAX helpers ----- */
  const opnMax: bigint | undefined = balOPN
    ? balOPN.value - GAS_RESERVE_WEI > 0n ? balOPN.value - GAS_RESERVE_WEI : 0n
    : undefined;
  const musdcMax = balMUSDC as bigint | undefined;
  const lpMax = userLP as bigint | undefined;

  const opnBalFmt = balOPN === undefined ? '—' : `${formatOPN(balOPN.value)} OPN`;
  const musdcBalFmt = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;
  const lpBalFmt = lpMax === undefined ? '—' : `${formatLP(lpMax)} LP`;

  const onMaxOPN = () => {
    if (!opnMax) return;
    setLastEdited('opn');
    setOpnAmount(formatOPN(opnMax, 18));
  };
  const onMaxMUSDC = () => {
    if (!musdcMax) return;
    setLastEdited('musdc');
    setMusdcAmount(formatMUSDC(musdcMax, 6));
  };
  const onMaxLP = () => {
    if (!lpMax) return;
    setLpText(formatLP(lpMax, 18));
  };

  /* USD value helpers (mUSDC anchors $1) */
  const opnUSD = useMemo<bigint>(() => {
    if (!parsedOPN || parsedOPN <= 0n || !reserveOPN || !reserveMUSDC) return 0n;
    return usdOfOPN(parsedOPN, reserveOPN, reserveMUSDC);
  }, [parsedOPN, reserveOPN, reserveMUSDC]);
  const musdcUSD = parsedMUSDC ?? 0n;
  const removeOPNUSD = useMemo<bigint>(() => {
    if (!removePreview || !reserveOPN || !reserveMUSDC) return 0n;
    return usdOfOPN(removePreview.opnOut, reserveOPN, reserveMUSDC);
  }, [removePreview, reserveOPN, reserveMUSDC]);

  const reset = () => {
    setOpnAmount('');
    setMusdcAmount('');
    setLpText('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  const busy = phase !== 'idle' && phase !== 'success';
  const needsApproval = mode === 'add' && parsedMUSDC !== null && allowance < parsedMUSDC;

  const onSubmit = async () => {
    if (!pair || !publicClient) { setError('No deployment for this network.'); return; }
    setError(null);
    try {
      if (mode === 'add') {
        if (!parsedOPN || !parsedMUSDC || parsedOPN <= 0n || parsedMUSDC <= 0n) {
          throw new Error('Enter both amounts > 0');
        }
        if (needsApproval) {
          if (!mUSDC) throw new Error('mUSDC address not found');
          setPhase('approving');
          const h0 = await writeContractAsync({
            address: mUSDC,
            abi: mockUSDCAbi,
            functionName: 'approve',
            args: [pair, maxUint256],
          });
          await publicClient.waitForTransactionReceipt({ hash: h0 });
        }
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'addLiquidity',
          args: [parsedMUSDC],
          value: parsedOPN,
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
      } else {
        if (!parsedLP || parsedLP <= 0n) throw new Error('Enter LP > 0');
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'removeLiquidity',
          args: [parsedLP],
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
      }
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const ctaLabel = (() => {
    if (busy) {
      if (phase === 'approving') return 'Approving mUSDC…';
      if (phase === 'signing') return 'Confirm in wallet…';
      if (phase === 'pending') return mode === 'add' ? 'Adding liquidity…' : 'Removing liquidity…';
    }
    if (!user) return 'Connect wallet';
    if (!pair) return 'No deployment';
    if (mode === 'add') {
      if (!parsedOPN || parsedOPN <= 0n || !parsedMUSDC || parsedMUSDC <= 0n) return 'Enter amounts';
      if (opnMax !== undefined && parsedOPN > opnMax) return 'Insufficient OPN';
      if (musdcMax !== undefined && parsedMUSDC > musdcMax) return 'Insufficient mUSDC';
      if (needsApproval) return 'Approve mUSDC & Add';
      return 'Add liquidity';
    }
    if (!parsedLP || parsedLP <= 0n) return 'Enter LP amount';
    if (lpMax !== undefined && parsedLP > lpMax) return 'Insufficient LP';
    return 'Remove liquidity';
  })();

  const ctaDisabled = (() => {
    if (busy || !pair || !user) return true;
    if (mode === 'add') {
      if (!parsedOPN || parsedOPN <= 0n || !parsedMUSDC || parsedMUSDC <= 0n) return true;
      if (opnMax !== undefined && parsedOPN > opnMax) return true;
      if (musdcMax !== undefined && parsedMUSDC > musdcMax) return true;
      return false;
    }
    if (!parsedLP || parsedLP <= 0n) return true;
    if (lpMax !== undefined && parsedLP > lpMax) return true;
    return false;
  })();

  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Liquidity</h3>
        {/* Add/Remove toggle */}
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          <button
            type="button"
            onClick={() => switchMode('add')}
            className={
              'rounded-md px-3 py-1 text-xs font-medium transition ' +
              (mode === 'add' ? 'bg-black text-white' : 'text-zinc-600 hover:text-black')
            }
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => switchMode('remove')}
            className={
              'rounded-md px-3 py-1 text-xs font-medium transition ' +
              (mode === 'remove' ? 'bg-black text-white' : 'text-zinc-600 hover:text-black')
            }
          >
            Remove
          </button>
        </div>
      </header>

      {mode === 'add' && (
        <div className="space-y-2">
          {/* OPN input */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1.5 text-xs font-medium text-zinc-500">OPN</div>
            <div className="flex items-center gap-3">
              <input
                value={opnAmount}
                onChange={(e) => { setLastEdited('opn'); setOpnAmount(e.target.value); }}
                placeholder="0"
                inputMode="decimal"
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300 disabled:opacity-50"
              />
              <TokenPill symbol="OPN" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span>${formatMUSDC(opnUSD)}</span>
              <div className="flex items-center gap-2">
                <span>Balance: {opnBalFmt}</span>
                <button
                  type="button"
                  onClick={onMaxOPN}
                  disabled={busy || !opnMax || opnMax === 0n}
                  className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          {/* + indicator */}
          <div className="-my-1 flex justify-center">
            <div className="z-10 rounded-xl border border-zinc-200 bg-white p-2 text-black shadow-sm">
              <Plus className="h-4 w-4" aria-hidden />
            </div>
          </div>

          {/* mUSDC input */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1.5 text-xs font-medium text-zinc-500">mUSDC</div>
            <div className="flex items-center gap-3">
              <input
                value={musdcAmount}
                onChange={(e) => { setLastEdited('musdc'); setMusdcAmount(e.target.value); }}
                placeholder="0"
                inputMode="decimal"
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300 disabled:opacity-50"
              />
              <TokenPill symbol="mUSDC" />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span>${formatMUSDC(musdcUSD)}</span>
              <div className="flex items-center gap-2">
                <span>Balance: {musdcBalFmt}</span>
                <button
                  type="button"
                  onClick={onMaxMUSDC}
                  disabled={busy || !musdcMax || musdcMax === 0n}
                  className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  MAX
                </button>
              </div>
            </div>
          </div>

          {/* Preview line */}
          <div className="mt-3 flex items-center justify-between px-1 text-xs text-zinc-600">
            <span>You'll receive</span>
            <span className="font-medium text-black">
              {quotedLP === undefined ? '—' : `${formatLP(quotedLP)} LP`}
            </span>
          </div>
        </div>
      )}

      {mode === 'remove' && (
        <div className="space-y-2">
          {/* LP input */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
            <div className="mb-1.5 text-xs font-medium text-zinc-500">LP to burn</div>
            <div className="flex items-center gap-3">
              <input
                value={lpText}
                onChange={(e) => setLpText(e.target.value)}
                placeholder="0"
                inputMode="decimal"
                disabled={busy}
                className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300 disabled:opacity-50"
              />
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-sm font-semibold text-black">
                LP
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
              <span>Available: {lpBalFmt}</span>
              <button
                type="button"
                onClick={onMaxLP}
                disabled={busy || !lpMax || lpMax === 0n}
                className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
              >
                MAX
              </button>
            </div>
          </div>

          {/* You'll receive */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 space-y-2">
            <div className="text-xs font-medium text-zinc-500">You'll receive</div>
            <div className="flex items-center justify-between">
              <TokenPill symbol="OPN" />
              <div className="text-right">
                <div className="text-base font-medium tabular-nums">
                  {removePreview ? formatOPN(removePreview.opnOut) : '—'}
                </div>
                <div className="text-[11px] text-zinc-500">${formatMUSDC(removeOPNUSD)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <TokenPill symbol="mUSDC" />
              <div className="text-right">
                <div className="text-base font-medium tabular-nums">
                  {removePreview ? formatMUSDC(removePreview.mUSDCOut) : '—'}
                </div>
                <div className="text-[11px] text-zinc-500">${removePreview ? formatMUSDC(removePreview.mUSDCOut) : '0.00'}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={onSubmit}
        disabled={ctaDisabled}
        className={
          'mt-4 w-full rounded-2xl py-3 text-sm font-semibold transition ' +
          (ctaDisabled
            ? 'bg-zinc-200 text-zinc-500 cursor-not-allowed'
            : 'bg-black text-white hover:bg-zinc-800')
        }
      >
        {ctaLabel}
      </button>

      {(error || phase === 'success' || (busy && txHash) || (phase !== 'idle' && txHash)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {error && <span className="text-red-600">Error: {error}</span>}
          {phase === 'success' && (
            <span className="text-emerald-600">
              {mode === 'add' ? 'Liquidity added.' : 'Liquidity removed.'}
            </span>
          )}
          {explorer && (
            <a
              href={explorer}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-zinc-700 underline hover:text-black"
            >
              view tx <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          )}
          {phase === 'success' && (
            <button
              type="button"
              onClick={reset}
              className="text-zinc-500 underline hover:text-black"
            >
              reset
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function TokenPill({ symbol }: { symbol: 'OPN' | 'mUSDC' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white border border-zinc-200 px-3 py-1.5 text-sm font-semibold text-black">
      <span
        aria-hidden
        className={
          'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ' +
          (symbol === 'OPN' ? 'bg-black' : 'bg-emerald-600')
        }
      >
        {symbol === 'OPN' ? 'O' : '$'}
      </span>
      {symbol}
    </span>
  );
}
