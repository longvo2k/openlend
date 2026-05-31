'use client';

type Unit = 'OPN' | 'mUSDC' | 'LP';
type Accent = 'emerald' | 'sky' | 'amber' | 'violet';

const ACCENT_TEXT: Record<Accent, string> = {
  emerald: 'text-black',
  sky: 'text-black',
  amber: 'text-black',
  violet: 'text-black',
};

export interface TokenInputProps {
  label: string;
  value: string;
  onChange?: (s: string) => void; // omit → read-only
  unit: Unit;
  disabled?: boolean;
  placeholder?: string;
  maxValue?: bigint;
  maxLabel?: string;
  maxFormatted?: string; // human-readable "1.2345 OPN" — caller formats
  onMax?: () => void;
  accent?: Accent;
}

export function TokenInput({
  label,
  value,
  onChange,
  unit,
  disabled,
  placeholder = '0.0',
  maxValue,
  maxLabel,
  maxFormatted,
  onMax,
  accent = 'emerald',
}: TokenInputProps) {
  const readOnly = onChange === undefined;
  const hasMax = onMax !== undefined;
  const maxDisabled = disabled || !maxValue || maxValue === 0n;
  const accentClass = ACCENT_TEXT[accent];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-xs uppercase tracking-wide">
        <span className="text-zinc-700">{label}</span>
        {hasMax && (
          <button
            type="button"
            disabled={maxDisabled}
            onClick={onMax}
            className={`rounded bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold tracking-wider transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-30 ${accentClass}`}
          >
            MAX
          </button>
        )}
      </div>
      <div
        className={`flex items-center rounded-lg border border-zinc-300 bg-white px-3 py-2.5 transition focus-within:border-amber-500 ${
          disabled || readOnly ? 'opacity-80' : ''
        }`}
      >
        <input
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          inputMode="decimal"
          readOnly={readOnly}
          disabled={disabled}
          className="min-w-0 flex-1 bg-transparent text-lg font-medium outline-none disabled:opacity-50"
        />
        <span className="ml-2 text-sm font-medium text-zinc-700">{unit}</span>
      </div>
      {hasMax && (maxFormatted || maxLabel) && (
        <div className="mt-1 text-[11px] text-zinc-700">
          {maxLabel ?? 'Available'}: {maxFormatted ?? '—'}
        </div>
      )}
    </div>
  );
}
