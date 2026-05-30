'use client';

import { useEffect, useState } from 'react';

export type Section = 'lend' | 'swap';
export type LendView = 'dashboard' | 'actions' | 'liquidate' | 'history';
export type SwapView = 'swap' | 'liquidity' | 'faucet';
export type ActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay';

interface SectionLink {
  section: Section;
  label: string;
  accent: string;
}

const SECTIONS: SectionLink[] = [
  { section: 'lend', label: 'Lend', accent: 'bg-emerald-500 text-black' },
  { section: 'swap', label: 'Swap', accent: 'bg-sky-500 text-black' },
];

interface LendLink {
  view: LendView;
  label: string;
  accent: string;
}

const LEND_VIEWS: LendLink[] = [
  { view: 'dashboard', label: 'Dashboard', accent: 'bg-zinc-200 text-black' },
  { view: 'actions', label: 'Actions', accent: 'bg-emerald-500 text-black' },
  { view: 'liquidate', label: 'Liquidate', accent: 'bg-red-500 text-black' },
  { view: 'history', label: 'History', accent: 'bg-zinc-400 text-black' },
];

interface SwapLink {
  view: SwapView;
  label: string;
  accent: string;
}

const SWAP_VIEWS: SwapLink[] = [
  { view: 'swap', label: 'Swap', accent: 'bg-emerald-500 text-black' },
  { view: 'liquidity', label: 'Liquidity', accent: 'bg-violet-500 text-black' },
  { view: 'faucet', label: 'Faucet', accent: 'bg-amber-500 text-black' },
];

interface SectionNavProps {
  active: Section;
  onChange: (s: Section) => void;
}

export function SectionNav({ active, onChange }: SectionNavProps) {
  return (
    <nav
      className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
      role="tablist"
      aria-label="Protocol"
    >
      {SECTIONS.map((s) => {
        const isActive = s.section === active;
        return (
          <button
            key={s.section}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(s.section)}
            className={
              'rounded-lg px-4 py-1.5 text-sm font-semibold transition sm:px-5 ' +
              (isActive ? s.accent : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
            }
          >
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}

interface LendSubNavProps {
  active: LendView;
  onChange: (v: LendView) => void;
}

export function LendSubNav({ active, onChange }: LendSubNavProps) {
  return (
    <nav
      className="inline-flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1"
      role="tablist"
      aria-label="Lend section"
    >
      {LEND_VIEWS.map((l) => {
        const isActive = l.view === active;
        return (
          <button
            key={l.view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(l.view)}
            className={
              'rounded-md px-3 py-1 text-sm font-medium transition ' +
              (isActive ? l.accent : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
            }
          >
            {l.label}
          </button>
        );
      })}
    </nav>
  );
}

interface SwapSubNavProps {
  active: SwapView;
  onChange: (v: SwapView) => void;
}

export function SwapSubNav({ active, onChange }: SwapSubNavProps) {
  return (
    <nav
      className="inline-flex flex-wrap gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1"
      role="tablist"
      aria-label="Swap section"
    >
      {SWAP_VIEWS.map((l) => {
        const isActive = l.view === active;
        return (
          <button
            key={l.view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(l.view)}
            className={
              'rounded-md px-3 py-1 text-sm font-medium transition ' +
              (isActive ? l.accent : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
            }
          >
            {l.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ----------------------------- Hash routing ----------------------------- */

/**
 * Flat hash format. The section is derived from the page hash so direct
 * links keep working:
 *
 *   #dashboard / #liquidate / #history → Lend section
 *   #supply / #withdraw / #borrow / #repay → Lend > Actions
 *   #swap / #liquidity / #faucet → Swap section
 */
interface Route {
  section: Section;
  lendView: LendView;
  swapView: SwapView;
  action: ActionKind;
}

function routeFromHash(hash: string): Route {
  const h = hash.replace('#', '');
  if (h === 'swap' || h === 'liquidity' || h === 'faucet') {
    return { section: 'swap', lendView: 'dashboard', swapView: h, action: 'supply' };
  }
  if (h === 'supply' || h === 'withdraw' || h === 'borrow' || h === 'repay') {
    return { section: 'lend', lendView: 'actions', swapView: 'swap', action: h };
  }
  if (h === 'liquidate') {
    return { section: 'lend', lendView: 'liquidate', swapView: 'swap', action: 'supply' };
  }
  if (h === 'history') {
    return { section: 'lend', lendView: 'history', swapView: 'swap', action: 'supply' };
  }
  if (h === 'actions') {
    return { section: 'lend', lendView: 'actions', swapView: 'swap', action: 'supply' };
  }
  return { section: 'lend', lendView: 'dashboard', swapView: 'swap', action: 'supply' };
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>({
    section: 'lend',
    lendView: 'dashboard',
    swapView: 'swap',
    action: 'supply',
  });

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  function write(target: string) {
    setRoute(routeFromHash(`#${target}`));
    if (typeof window !== 'undefined') {
      history.replaceState(null, '', `#${target}`);
    }
  }

  return {
    ...route,
    /** Switch top-level section, falling back to its default sub-view. */
    setSection(s: Section) {
      write(s === 'lend' ? 'dashboard' : 'swap');
    },
    /** Switch Lend sub-view. For `actions`, also pass the desired action. */
    setLendView(v: LendView, a?: ActionKind) {
      if (v === 'actions') write(a ?? route.action);
      else write(v);
    },
    /** Switch Swap sub-view. */
    setSwapView(v: SwapView) {
      write(v);
    },
  };
}
