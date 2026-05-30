'use client';

import { ActionPanel } from './ActionPanel';
import type { ActionKind } from './MainNav';

const SUB_TABS: { kind: ActionKind; label: string; accent: string }[] = [
  { kind: 'supply', label: 'Supply', accent: 'bg-emerald-500 text-black' },
  { kind: 'withdraw', label: 'Withdraw', accent: 'bg-sky-500 text-black' },
  { kind: 'borrow', label: 'Borrow', accent: 'bg-amber-500 text-black' },
  { kind: 'repay', label: 'Repay', accent: 'bg-violet-500 text-black' },
];

interface Props {
  action: ActionKind;
  onChange: (k: ActionKind) => void;
}

export function ActionsView({ action, onChange }: Props) {
  return (
    <div className="space-y-4">
      <nav
        className="inline-flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1"
        role="tablist"
        aria-label="Action"
      >
        {SUB_TABS.map((t) => {
          const isActive = t.kind === action;
          return (
            <button
              key={t.kind}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.kind)}
              className={
                'rounded-md px-3 py-1 text-sm font-medium transition ' +
                (isActive ? t.accent : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="max-w-lg">
        <ActionPanel kind={action} />
      </div>
    </div>
  );
}
