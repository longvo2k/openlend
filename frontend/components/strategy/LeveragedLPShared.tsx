'use client';

import { parseUnits } from 'viem';
import { iopnTestnet } from '@/lib/chains';

/**
 * Reserve to deduct from MAX so the wallet still has OPN for gas.
 * Composer runs up to 4 sequential txs; at 7 gwei × ~200k gas per tx that's
 * ~0.006 OPN. Reserve 0.01 OPN to leave headroom and follow-up retries.
 */
export const GAS_RESERVE_WEI = 10_000_000_000_000_000n; // 0.01 OPN
export const LTV_CLAMP_BPS = 7000;
export const PROTOCOL_LTV_BPS = 7500;
export const LIQUIDATION_THRESHOLD_BPS = 8000;

export type StepState = 'idle' | 'sign' | 'pending' | 'done' | 'failed' | 'skipped';

export function parseMUSDC(s: string): bigint {
  return parseUnits(s.trim(), 6);
}

export function Field({
  label,
  unit,
  value,
  onChange,
  disabled,
  maxValue,
  maxFormatted,
  onMax,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (s: string) => void;
  disabled: boolean;
  maxValue?: bigint;
  maxFormatted?: string;
  onMax?: () => void;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
        <span className="text-zinc-700">{label}</span>
        {onMax && (
          <button
            type="button"
            disabled={disabled || !maxValue || maxValue === 0n}
            onClick={onMax}
            className="rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30"
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2.5 focus-within:border-amber-500 ${
          disabled ? 'opacity-60' : ''
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0.0"
          inputMode="decimal"
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none"
        />
        <span className="ml-2 text-sm font-medium text-zinc-700">{unit}</span>
      </div>
      {maxFormatted && (
        <div className="mt-1 text-[11px] text-zinc-700">Wallet: {maxFormatted}</div>
      )}
    </div>
  );
}

export function Row({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-zinc-700">{label}</span>
      <span className={`tabular-nums ${valueClass ?? 'text-black'}`}>{value}</span>
    </div>
  );
}

export function StepRow({
  label,
  state,
  hash,
}: {
  label: string;
  state: StepState;
  hash?: `0x${string}`;
}) {
  const explorer = hash
    ? `${iopnTestnet.blockExplorers.default.url}/tx/${hash}`
    : null;
  const glyph =
    state === 'done'
      ? '✓'
      : state === 'failed'
      ? '✗'
      : state === 'sign'
      ? '◔'
      : state === 'pending'
      ? '◐'
      : state === 'skipped'
      ? '—'
      : '○';
  const text =
    state === 'done'
      ? 'text-emerald-700'
      : state === 'failed'
      ? 'text-red-700'
      : state === 'sign'
      ? 'text-zinc-900'
      : state === 'pending'
      ? 'text-zinc-900'
      : state === 'skipped'
      ? 'text-zinc-600'
      : 'text-zinc-700';
  const detail =
    state === 'sign'
      ? '(confirm in wallet…)'
      : state === 'pending'
      ? '(pending…)'
      : state === 'failed'
      ? '(failed)'
      : state === 'skipped'
      ? '(allowance ok, skipped)'
      : null;
  return (
    <li className="flex items-center gap-2">
      <span className={`${text} w-3 text-center`}>{glyph}</span>
      <span className={text}>{label}</span>
      {detail && <span className="text-zinc-700">{detail}</span>}
      {explorer && (
        <a
          className="text-zinc-900 underline hover:text-black"
          target="_blank"
          rel="noopener noreferrer"
          href={explorer}
        >
          tx ↗
        </a>
      )}
    </li>
  );
}
