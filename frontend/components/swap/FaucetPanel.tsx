'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { ExternalLink } from 'lucide-react';
import { TermHint } from '@/components/ui/TermHint';
import { getMockUSDCAddress, mockUSDCAbi } from '@/lib/contract';
import { iopnTestnet } from '@/lib/chains';
import { formatMUSDC, parseMUSDC } from '@/lib/format';

type Phase = 'idle' | 'signing' | 'pending' | 'success';

export function FaucetPanel() {
  const chainId = useChainId();
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [text, setText] = useState('10000');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  const { data: capRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'MAX_MINT_PER_CALL',
    query: { enabled: Boolean(mUSDC) },
  });
  const cap = capRaw as bigint | undefined;
  const capFmt = cap === undefined ? '—' : `${formatMUSDC(cap)} mUSDC`;

  const { data: balRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const bal = balRaw as bigint | undefined;
  const balFmt = bal === undefined ? '—' : `${formatMUSDC(bal)} mUSDC`;

  const parsed: bigint | null = useMemo(() => {
    try { return text ? parseMUSDC(text) : null; } catch { return null; }
  }, [text]);

  const overCap = cap !== undefined && parsed !== null && parsed > cap;

  const onMax = () => {
    if (!cap) return;
    setText(formatMUSDC(cap, 6));
  };

  const reset = () => {
    setText('10000');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase !== 'idle' && phase !== 'success';

  const onSubmit = async () => {
    if (!mUSDC || !publicClient) { setError('No mUSDC deployment for this network.'); return; }
    if (!parsed || parsed <= 0n) { setError('Enter an amount > 0'); return; }
    if (overCap) { setError(`Above ${capFmt} cap`); return; }
    setError(null);
    try {
      setPhase('signing');
      const h = await writeContractAsync({
        address: mUSDC,
        abi: mockUSDCAbi,
        functionName: 'mint',
        args: [parsed],
      });
      setTxHash(h);
      setPhase('pending');
      await publicClient.waitForTransactionReceipt({ hash: h });
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const ctaLabel = (() => {
    if (busy) {
      if (phase === 'signing') return 'Confirm in wallet…';
      if (phase === 'pending') return 'Minting…';
    }
    if (!user) return 'Connect wallet';
    if (!mUSDC) return 'No deployment';
    if (!parsed) return 'Enter an amount';
    if (overCap) return `Above ${capFmt} cap`;
    return 'Mint mUSDC';
  })();

  const ctaDisabled = busy || !user || !mUSDC || !parsed || overCap;
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="inline-flex items-center gap-1 text-base font-semibold">
          <TermHint term="Faucet">Faucet</TermHint>
        </h3>
        <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
          Cap {capFmt} per call
        </span>
      </header>

      <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4">
        <div className="mb-1.5 text-xs font-medium text-zinc-500">Mint</div>
        <div className="flex items-center gap-3">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="0"
            inputMode="decimal"
            disabled={busy}
            className="min-w-0 flex-1 bg-transparent text-2xl sm:text-3xl font-medium outline-none placeholder-zinc-300 disabled:opacity-50"
          />
          <TokenPill symbol="mUSDC" />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
          <span>${parsed ? formatMUSDC(parsed) : '0.00'}</span>
          <div className="flex items-center gap-2">
            <span>Balance: {balFmt}</span>
            <button
              type="button"
              onClick={onMax}
              disabled={busy || !cap}
              className="rounded-md bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold text-black hover:bg-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              MAX
            </button>
          </div>
        </div>
      </div>

      {overCap && (
        <p className="mt-2 px-1 text-xs text-amber-700">
          Above the {capFmt} per-call cap. Lower the amount or call the faucet again.
        </p>
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

      {(error || phase === 'success' || (busy && txHash)) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          {error && <span className="text-red-600">Error: {error}</span>}
          {phase === 'success' && (
            <span className="text-emerald-600">
              Minted. Balance now {balFmt}.
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
