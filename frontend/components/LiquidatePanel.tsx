'use client';

import { useMemo, useState } from 'react';
import {
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { iopnTestnet } from '../lib/chains';
import { formatHF, formatOPN, parseOPN } from '../lib/format';

type Phase = 'idle' | 'signing' | 'pending' | 'success';

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export function LiquidatePanel() {
  const chainId = useChainId();
  const pool = getLendingPoolAddress(chainId);
  const publicClient = usePublicClient();

  const [target, setTarget] = useState('');
  const [amount, setAmount] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();

  const { writeContractAsync } = useWriteContract();

  const targetValid = ADDRESS_RE.test(target);
  const targetAddr = targetValid ? (target as `0x${string}`) : undefined;

  // Read the target's debt + HF only when the address is well-formed.
  const { data: acctRaw } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'getAccountData',
    args: targetAddr ? [targetAddr] : undefined,
    query: {
      enabled: Boolean(pool && targetAddr),
      refetchInterval: 5000,
    },
  });
  const acct = acctRaw as readonly [bigint, bigint, bigint, bigint] | undefined;
  const collateral = acct?.[0];
  const debt = acct?.[1];
  const hf = acct?.[2];
  const hfFmt = formatHF(hf);

  const isHealthy =
    hf !== undefined && hf !== 0n && hf >= 10n ** 18n;
  const hasDebt = debt !== undefined && debt > 0n;

  const parsedAmount: bigint | null = useMemo(() => {
    try { return amount ? parseOPN(amount) : null; } catch { return null; }
  }, [amount]);

  // Close factor: max 50% of current debt per call.
  const maxRepay: bigint | undefined =
    debt !== undefined ? debt / 2n : undefined;
  const maxRepayFormatted =
    maxRepay === undefined ? '—' : `${formatOPN(maxRepay)} OPN`;
  const onMax = () => {
    if (!maxRepay) return;
    setAmount(formatOPN(maxRepay, 18));
  };

  const reset = () => {
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase === 'signing' || phase === 'pending';

  const onSubmit = async () => {
    if (!pool || !publicClient) {
      setError('No deployment for this network.');
      return;
    }
    if (!targetValid) {
      setError('Enter a valid 0x… address.');
      return;
    }
    if (!parsedAmount || parsedAmount <= 0n) {
      setError('Enter an amount > 0');
      return;
    }
    if (!hasDebt) {
      setError('Target has no outstanding debt.');
      return;
    }
    if (isHealthy) {
      setError('Position is healthy (HF ≥ 1.0). Cannot liquidate.');
      return;
    }
    setError(null);
    try {
      setPhase('signing');
      const hash = await writeContractAsync({
        address: pool,
        abi: lendingPoolAbi,
        functionName: 'liquidate',
        args: [targetAddr!],
        value: parsedAmount,
      });
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
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Liquidated ✓' :
    '';
  const explorer = txHash
    ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}`
    : null;

  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-red-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500/10 text-red-400 text-lg font-bold">
          ⚡
        </div>
        <div>
          <h3 className="text-lg font-semibold">Liquidate</h3>
          <p className="text-sm text-zinc-400">
            Close an unhealthy position. You repay up to 50% of the debt and
            receive collateral worth that amount plus a 5% bonus.
          </p>
        </div>
      </header>

      <div className="space-y-4">
        <label className="block">
          <span className="text-xs uppercase tracking-wide text-zinc-500">
            Borrower address
          </span>
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value.trim())}
            placeholder="0x…"
            disabled={busy}
            spellCheck={false}
            className="mt-1.5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 font-mono text-sm outline-none transition focus:border-red-500 disabled:opacity-50"
          />
          {target && !targetValid && (
            <span className="mt-1 block text-[11px] text-amber-300">
              Not a valid 0x address.
            </span>
          )}
        </label>

        {targetValid && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-zinc-500 uppercase tracking-wide">Collateral</div>
                <div className="mt-0.5 font-medium tabular-nums">
                  {collateral === undefined ? '…' : `${formatOPN(collateral)} OPN`}
                </div>
              </div>
              <div>
                <div className="text-zinc-500 uppercase tracking-wide">Debt</div>
                <div className="mt-0.5 font-medium tabular-nums">
                  {debt === undefined ? '…' : `${formatOPN(debt)} OPN`}
                </div>
              </div>
              <div>
                <div className="text-zinc-500 uppercase tracking-wide">HF</div>
                <div className={`mt-0.5 font-semibold tabular-nums ${hfClass}`}>
                  {hf === undefined ? '…' : hfFmt.text}
                </div>
              </div>
            </div>
            {hasDebt && isHealthy && (
              <p className="mt-3 text-[11px] text-amber-300">
                Position is healthy (HF ≥ 1.0). Liquidation will revert.
              </p>
            )}
            {hasDebt === false && (
              <p className="mt-3 text-[11px] text-zinc-500">
                Target has no debt — nothing to liquidate.
              </p>
            )}
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
            <span className="text-zinc-500">Amount to repay</span>
            <button
              type="button"
              disabled={busy || !maxRepay || maxRepay === 0n}
              onClick={onMax}
              className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-red-400 transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-30"
            >
              MAX
            </button>
          </div>
          <div
            className={`flex items-center rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 transition focus-within:border-red-500 ${
              busy ? 'opacity-50' : ''
            }`}
          >
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              inputMode="decimal"
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
            />
            <span className="ml-2 text-sm font-medium text-zinc-500">OPN</span>
          </div>
          {targetValid && (
            <div className="mt-1 text-[11px] text-zinc-500">
              Max per call (50% close factor): {maxRepayFormatted}
            </div>
          )}
        </div>

        <button
          onClick={onSubmit}
          disabled={busy || !pool || !targetValid || !parsedAmount}
          className="w-full rounded-lg bg-red-500 py-2.5 font-semibold text-black transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-red-500"
        >
          {busy ? 'Working…' : 'Liquidate'}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-400">
            <span>{status}</span>
            {explorer && (
              <a
                className="text-red-400 underline hover:opacity-80"
                target="_blank"
                rel="noopener noreferrer"
                href={explorer}
              >
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-500 underline" onClick={reset}>
                reset
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
