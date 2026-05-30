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
import { TokenInput } from '../ui/TokenInput';
import { SlippageSelector } from '../ui/SlippageSelector';

type Direction = 'opn-to-musdc' | 'musdc-to-opn';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN

export function SwapPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [direction, setDirection] = useState<Direction>('opn-to-musdc');
  const [amountIn, setAmountIn] = useState('');
  const [slippageBps, setSlippageBps] = useState(100); // 1.00%
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  // ----- Reads -----
  const opnIsInput = direction === 'opn-to-musdc';

  const { data: balOPN } = useBalance({
    address: user,
    query: { enabled: Boolean(user && opnIsInput), refetchInterval: 5000 },
  });

  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user && !opnIsInput), refetchInterval: 5000 },
  });

  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && !opnIsInput), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  // Parse amount in (raw bigint, units matching the input token).
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

  // ----- MAX -----
  const primaryMax: bigint | undefined = useMemo(() => {
    if (opnIsInput) {
      if (!balOPN) return undefined;
      const m = balOPN.value - GAS_RESERVE_WEI;
      return m > 0n ? m : 0n;
    }
    return balMUSDC as bigint | undefined;
  }, [opnIsInput, balOPN, balMUSDC]);

  const primaryMaxLabel = 'Wallet';
  const primaryMaxFormatted = primaryMax === undefined
    ? '—'
    : opnIsInput
    ? `${formatOPN(primaryMax)} OPN`
    : `${formatMUSDC(primaryMax)} mUSDC`;

  const onMaxPrimary = () => {
    if (!primaryMax) return;
    setAmountIn(opnIsInput ? formatOPN(primaryMax, 18) : formatMUSDC(primaryMax, 6));
  };

  // ----- Flip -----
  const flip = () => {
    setDirection((d) => (d === 'opn-to-musdc' ? 'musdc-to-opn' : 'opn-to-musdc'));
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const reset = () => {
    setAmountIn('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  // Reset transient phase when direction changes.
  useEffect(() => {
    if (phase === 'success' || phase === 'pending' || phase === 'signing' || phase === 'approving') {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [direction]);

  const busy = phase === 'approving' || phase === 'signing' || phase === 'pending';

  const needsApproval =
    !opnIsInput && parsedAmountIn !== null && allowance < parsedAmountIn;

  const ctaLabel = needsApproval ? 'Approve mUSDC' : opnIsInput ? 'Swap' : 'Swap';

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
      setError('Waiting for quote — try again');
      return;
    }
    setError(null);
    try {
      // mUSDC → OPN: ensure allowance.
      if (!opnIsInput && allowance < parsedAmountIn) {
        if (!mUSDC) {
          setError('mUSDC address not found');
          return;
        }
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

  const status =
    error ? `Error: ${error}` :
    phase === 'approving' ? 'Approve in wallet…' :
    phase === 'signing' ? 'Confirm swap in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Swapped ✓' :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  const fromUnit = opnIsInput ? 'OPN' : 'mUSDC';
  const toUnit = opnIsInput ? 'mUSDC' : 'OPN';
  const quoteText = quote === undefined
    ? ''
    : opnIsInput
    ? formatMUSDC(quote, 6)
    : formatOPN(quote, 8);
  const minOutText = minOut === undefined
    ? '—'
    : opnIsInput
    ? `${formatMUSDC(minOut)} mUSDC`
    : `${formatOPN(minOut)} OPN`;

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 text-lg font-bold">↔</div>
        <div>
          <h3 className="text-lg font-semibold">Swap</h3>
          <p className="text-sm text-zinc-400">Trade native OPN ↔ mUSDC. 0.30% fee retained for LPs.</p>
        </div>
      </header>

      <div className="space-y-4">
        <TokenInput
          label="From"
          value={amountIn}
          onChange={setAmountIn}
          unit={fromUnit}
          disabled={busy}
          maxValue={primaryMax}
          maxLabel={primaryMaxLabel}
          maxFormatted={primaryMaxFormatted}
          onMax={onMaxPrimary}
          accent="emerald"
        />

        <div className="flex justify-center">
          <button
            type="button"
            onClick={flip}
            disabled={busy}
            aria-label="Flip swap direction"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-3 py-1 text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
          >
            ⇅
          </button>
        </div>

        <TokenInput
          label="To (estimated)"
          value={quoteText}
          unit={toUnit}
          disabled={busy}
          accent="sky"
        />

        <SlippageSelector valueBps={slippageBps} onChange={setSlippageBps} disabled={busy} />

        <div className="text-xs text-zinc-500">
          Min received at {(slippageBps / 100).toFixed(2)}% slippage: <span className="text-zinc-300">{minOutText}</span>
        </div>

        <button
          onClick={onSubmit}
          disabled={busy || !pair || !parsedAmountIn || parsedAmountIn <= 0n}
          className="w-full rounded-lg bg-emerald-500 py-2.5 font-semibold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-emerald-500"
        >
          {busy ? 'Working…' : ctaLabel}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{status}</span>
            {explorer && (
              <a className="text-emerald-400 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-500 underline" onClick={reset}>reset</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
