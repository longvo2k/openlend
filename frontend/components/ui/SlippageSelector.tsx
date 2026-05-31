'use client';

import { useState } from 'react';

const PRESETS: { label: string; bps: number }[] = [
  { label: '0.5%', bps: 50 },
  { label: '1.0%', bps: 100 },
  { label: '3.0%', bps: 300 },
];

export interface SlippageSelectorProps {
  valueBps: number;
  onChange: (bps: number) => void;
  disabled?: boolean;
}

export function SlippageSelector({ valueBps, onChange, disabled }: SlippageSelectorProps) {
  const matchesPreset = PRESETS.some((p) => p.bps === valueBps);
  const [showCustom, setShowCustom] = useState(!matchesPreset);
  const [customText, setCustomText] = useState(
    matchesPreset ? '' : (valueBps / 100).toFixed(2),
  );

  const onPresetClick = (bps: number) => {
    setShowCustom(false);
    onChange(bps);
  };

  const onCustomClick = () => {
    setShowCustom(true);
    if (customText === '') {
      setCustomText('1.00');
      onChange(100);
    }
  };

  const onCustomChange = (s: string) => {
    setCustomText(s);
    const parsed = parseFloat(s);
    if (!Number.isFinite(parsed)) return;
    const bps = Math.max(1, Math.min(5000, Math.round(parsed * 100)));
    onChange(bps);
  };

  return (
    <div>
      <div className="mb-1.5 text-xs uppercase tracking-wide text-zinc-700">Slippage</div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const active = !showCustom && p.bps === valueBps;
          return (
            <button
              key={p.bps}
              type="button"
              disabled={disabled}
              onClick={() => onPresetClick(p.bps)}
              className={
                'rounded-md px-3 py-1 text-sm font-medium transition disabled:opacity-50 ' +
                (active
                  ? 'bg-black text-white'
                  : 'bg-zinc-100 text-black hover:bg-zinc-200')
              }
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          disabled={disabled}
          onClick={onCustomClick}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition disabled:opacity-50 ' +
            (showCustom
              ? 'bg-black text-white'
              : 'bg-zinc-100 text-black hover:bg-zinc-200')
          }
        >
          Custom
        </button>
        {showCustom && (
          <div className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white px-2 py-1">
            <input
              value={customText}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              disabled={disabled}
              className="w-14 bg-transparent text-sm text-black outline-none"
            />
            <span className="text-xs text-zinc-700">%</span>
          </div>
        )}
      </div>
    </div>
  );
}
