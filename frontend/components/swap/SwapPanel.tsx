'use client';

import { useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { ArrowDown, ChevronDown, ChevronUp, ExternalLink, Settings } from 'lucide-react';
import {
  getMockUSDCAddress,
  getPairAddress,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import {
  applySlippage,
  formatMUSDC,
  formatOPN,
  parseMUSDC,
  parseOPN,
} from '../../lib/format';

type Direction = 'opn-to-musdc' | 'musdc-to-opn';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 10_000_000_000_000_000n; // 0.01 OPN (~10 txs at 7 gwei)
const SLIPPAGE_PRESETS_BPS = [50, 100, 300] as const;

/* mUSDC anchors $1. OPN's USD value is derived from the pool's spot
 * ratio. Returns a uint256 in 6-decimal mUSDC units, so formatMUSDC
 * renders it directly as a dollar value. */
function usdOfOPN(amountOPN: bigint, reserveOPN: bigint, reserveMUSDC: bigint): bigint {
  if (reserveOPN === 0n) return 0n;
  return (amountOPN * reserveMUSDC) / reserveOPN;
}

export function SwapPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [direction, setDirection] = useState<Direction>('opn-to-musdc');
  const [amountIn, setAmountIn] = useState('');
  const [slippageBps, setSlippageBps] = useState(100); // 1.00%
  const [slippageOpen, setSlippageOpen] = useState(false);
  const [customSlippage, setCustomSlippage] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  /* ----- Reads ----- */
  const opnIsInput = direction === 'opn-to-musdc';
  const fromUnit = opnIsInput ? 'OPN' : 'mUSDC';
  const toUnit = opnIsInput ? 'mUSDC' : 'OPN';

  const { data: bal } = useBalance({
    address: user,
    query: { enabled: Boolean(user), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const balOPNValue = bal?.value;
  const balMUSDCValue = balMUSDC as bigint | undefined;

  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && !opnIsInput), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  const { data: reservesRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'getReserves',
    query: { enabled: Boolean(pair), refetchInterval: 5000 },
  });
  const reservesTuple = reservesRaw as readonly [bigint, bigint, number] | undefined;
  const reserveOPN = reservesTuple?.[0] ?? 0n;
  const reserveMUSDC = reservesTuple?.[1] ?? 0n;

  /* ----- Derived ----- */
  const parsedAmountIn: bigint | null = useMemo(() => {
    if (!amountIn) return null;
    try {
      return opnIsInput ? parseOPN(amountIn) : parseMUSDC(amountIn);
    } catch {
      return null;
    }
  }, [amountIn, opnIsInput]);

  const { data: quoteRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteSwap',
    args: parsedAmountIn ? [parsedAmountIn, opnIsInput] : undefined,
    query: {
      enabled: Boolean(pair && parsedAmountIn && parsedAmountIn > 0n),
      refetchInterval: 5000,
    },
  });
  const quote = quoteRaw as bigint | undefined;
  const minOut = quote ? applySlippage(quote, slippageBps) : undefined;

  // Spot rate "1 OPN = X mUSDC" (mUSDC units per 1 OPN)
  const spotRateMUSDCperOPN: bigint = useMemo(() => {
    if (reserveOPN === 0n) return 0n;
    return (10n ** 18n * reserveMUSDC) / reserveOPN;
  }, [reserveOPN, reserveMUSDC]);

  // USD value of the FROM amount, in mUSDC (6-decimal) units
  const fromUSD: bigint = useMemo(() => {
    if (!parsedAmountIn || parsedAmountIn <= 0n) return 0n;
    return opnIsInput ? usdOfOPN(parsedAmountIn, reserveOPN, reserveMUSDC) : parsedAmountIn;
  }, [parsedAmountIn, opnIsInput, reserveOPN, reserveMUSDC]);

  const toUSD: bigint = useMemo(() => {
    if (!quote || quote <= 0n) return 0n;
    return opnIsInput ? quote : usdOfOPN(quote, reserveOPN, reserveMUSDC);
  }, [quote, opnIsInput, reserveOPN, reserveMUSDC]);

  /* ----- MAX -----  */
  const fromMax: bigint | undefined = useMemo(() => {
    if (opnIsInput) {
      if (balOPNValue === undefined) return undefined;
      const m = balOPNValue - GAS_RESERVE_WEI;
      return m > 0n ? m : 0n;
    }
    return balMUSDCValue;
  }, [opnIsInput, balOPNValue, balMUSDCValue]);

  const fromBalanceFmt = opnIsInput
    ? balOPNValue === undefined
      ? '—'
      : `${formatOPN(balOPNValue)} OPN`
    : balMUSDCValue === undefined
    ? '—'
    : `${formatMUSDC(balMUSDCValue)} mUSDC`;

  const toBalanceFmt = opnIsInput
    ? balMUSDCValue === undefined
      ? '—'
      : `${formatMUSDC(balMUSDCValue)} mUSDC`
    : balOPNValue === undefined
    ? '—'
    : `${formatOPN(balOPNValue)} OPN`;

  /* ----- Actions ----- */
  const flip = () => {
    setDirection((d) => (d === 'opn-to-musdc' ? 'musdc-to-opn' : 'opn-to-musdc'));
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const onMaxFrom = () => {
    if (!fromMax) return;
    setAmountIn(opnIsInput ? formatOPN(fromMax, 18) : formatMUSDC(fromMax, 6));
  };

  const onSelectPreset = (bps: number) => {
    setSlippageBps(bps);
    setCustomSlippage('');
  };

  const onCustomSlippage = (s: string) => {
    setCustomSlippage(s);
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n <= 0) return;
    const bps = Math.max(1, Math.min(5000, Math.round(n * 100)));
    setSlippageBps(bps);
  };

  const reset = () => {
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  useEffect(() => {
    if (phase !== 'idle') reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const busy = phase === 'approving' || phase === 'signing' || phase === 'pending';
  const needsApproval = !opnIsInput && parsedAmountIn !== null && allowance < parsedAmountIn;

  const onSubmit = async () => {
    if (!pair || !publicClient) {
      setError('No deployment for this network.');
      return;
    }
    if (!parsedAmountIn || parsedAmountIn <= 0n) {
      setError('Enter an amount > 0');
      return;
    }
    if (minOut === undefined) {
      setError('Waiting for quote — try again.');
      return;
    }
    setError(null);
    try {
      if (needsApproval && mUSDC) {
        setPhase('approving');
        const approveHash = await writeContractAsync({
          address: mUSDC,
          abi: mockUSDCAbi,
          functionName: 'approve',
          args: [pair, maxUint256],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setPhase('signing');
      let hash: `0x${string}`;
      if (opnIsInput) {
        hash = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'swapOPNForMUSDC',
          args: [minOut],
          value: parsedAmountIn,
        });
      } else {
        hash = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'swapMUSDCForOPN',
          args: [parsedAmountIn, minOut],
        });
      }
      setTxHash(hash);
      setPhase('pending');
      await publicClient.waitForTransactionReceipt({ hash });
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
      if (phase === 'pending') return 'Swapping…';
    }
    if (!user) return 'Connect wallet';
    if (!pair) return 'No deployment';
    if (parsedAmountIn === null || parsedAmountIn <= 0n) return 'Enter an amount';
    if (fromMax !== undefined && parsedAmountIn > fromMax) return `Insufficient ${fromUnit}`;
    if (needsApproval) return 'Approve mUSDC & Swap';
    return 'Swap';
  })();

  const ctaDisabled =
    busy ||
    !pair ||
    !user ||
    parsedAmountIn === null ||
    parsedAmountIn <= 0n ||
    (fromMax !== undefined && parsedAmountIn > fromMax);

  const quoteText = quote === undefined ? '' : opnIsInput ? formatMUSDC(quote, 6) : formatOPN(quote, 8);
  const minOutText = minOut === undefined
    ? '—'
    : opnIsInput
    ? `${formatMUSDC(minOut)} mUSDC`
    : `${formatOPN(minOut)} OPN`;

  const spotRateText =
    spotRateMUSDCperOPN === 0n
      ? '—'
      : `1 OPN ≈ ${formatMUSDC(spotRateMUSDCperOPN)} mUSDC`;

  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
      {/* Header */}
      <header className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">Swap</h3>
        <button
          type="button"
          onClick={() => setSlippageOpen((v) => !v)}
          className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-600 hover:bg-zinc-100"
          aria-label="Slippage settings"
        >
          <Settings className="h-4 w-4" aria-hidden />
          {slippageOpen ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </header>

      {slippageOpen && (
        <div className="mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-600">Slippage tolerance</div>
          <div className="flex flex-wrap items-center gap-1.5">
            {SLIPPAGE_PRESETS_BPS.map((bps) => {
              const active = slippageBps === bps && customSlippage === '';
              return (
                <button
                  key={bps}
                  type="button"
                  onClick={() => onSelectPreset(bps)}
                  className={
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition ' +
                    (active
                      ? 'bg-black text-white'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-100')
                  }
                >
                  {(bps / 100).toFixed(bps % 100 === 0 ? 1 : 2)}%
                </button>
              );
            })}
            <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-0.5">
              <input
                value={customSlippage}
                onChange={(e) => onCustomSlippage(e.target.value)}
                placeholder="Custom"
                inputMode="decimal"
                className="w-16 bg-transparent text-xs outline-none placeholder-zinc-400"
              />
              <span className="text-xs text-zinc-500">%</span>
            </div>
          </div>
        </div>
      )}

      {/* From (Sell) card */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="mb-1.5 text-xs font-medium text-zinc-500">Sell</div>
        <div className="flex items-center gap-3">
          <input
            value={amountIn}
            onChange={(e) => setAmountIn(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300 disabled:opacity-50"
          />
          <TokenPill symbol={fromUnit} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>${formatMUSDC(fromUSD)}</span>
          <div className="flex items-center gap-2">
            <span>Balance: {fromBalanceFmt}</span>
            <button
              type="button"
              onClick={onMaxFrom}
              disabled={busy || !fromMax || fromMax === 0n}
              className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              MAX
            </button>
          </div>
        </div>
      </div>

      {/* Flip button */}
      <div className="-my-2 flex justify-center">
        <button
          type="button"
          onClick={flip}
          disabled={busy}
          aria-label="Flip swap direction"
          className="z-10 rounded-xl border border-zinc-200 bg-white p-2 text-black shadow-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          <ArrowDown className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* To (Buy) card */}
      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="mb-1.5 text-xs font-medium text-zinc-500">Buy</div>
        <div className="flex items-center gap-3">
          <input
            value={quoteText}
            placeholder="0"
            readOnly
            className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300"
          />
          <TokenPill symbol={toUnit} />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>${formatMUSDC(toUSD)}</span>
          <span>Balance: {toBalanceFmt}</span>
        </div>
      </div>

      {/* Rate + min received */}
      <div className="mt-3 space-y-1 px-1 text-xs text-zinc-600">
        <div className="flex items-center justify-between">
          <span>{spotRateText}</span>
          <span>Fee 0.30%</span>
        </div>
        {minOut !== undefined && (
          <div className="flex items-center justify-between">
            <span>Min received at {(slippageBps / 100).toFixed(2)}% slippage</span>
            <span className="font-medium text-black">{minOutText}</span>
          </div>
        )}
      </div>

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

      {/* Status row */}
      {(error || phase === 'success' || (busy && txHash) || (phase !== 'idle' && txHash)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {error && <span className="text-red-600">Error: {error}</span>}
          {phase === 'success' && <span className="text-emerald-600">Swap confirmed.</span>}
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
