'use client';

import { useEffect, useState } from 'react';

export type ActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay';
export type View = 'dashboard' | 'actions' | 'liquidate' | 'history';

interface NavLink {
  view: View;
  label: string;
  // Active accent classes for the pill background.
  accent: string;
}

const LINKS: NavLink[] = [
  { view: 'dashboard', label: 'Dashboard', accent: 'bg-zinc-200 text-black' },
  { view: 'actions', label: 'Actions', accent: 'bg-emerald-500 text-black' },
  { view: 'liquidate', label: 'Liquidate', accent: 'bg-red-500 text-black' },
  { view: 'history', label: 'History', accent: 'bg-zinc-400 text-black' },
];

interface Props {
  active: View;
  onChange: (v: View) => void;
}

export function MainNav({ active, onChange }: Props) {
  return (
    <nav
      className="inline-flex flex-wrap gap-1 rounded-xl border border-zinc-800 bg-zinc-900 p-1"
      role="tablist"
      aria-label="Main navigation"
    >
      {LINKS.map((l) => {
        const isActive = l.view === active;
        return (
          <button
            key={l.view}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(l.view)}
            className={
              'rounded-lg px-3 py-1.5 text-sm font-medium transition sm:px-4 ' +
              (isActive
                ? l.accent
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200')
            }
          >
            {l.label}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * Compute the active main view from a URL hash. Sub-action hashes
 * (#supply / #withdraw / #borrow / #repay) all map to the Actions view.
 */
function viewFromHash(hash: string): View {
  const h = hash.replace('#', '');
  if (h === 'dashboard') return 'dashboard';
  if (h === 'liquidate') return 'liquidate';
  if (h === 'history') return 'history';
  if (h === 'actions' || h === 'supply' || h === 'withdraw' || h === 'borrow' || h === 'repay') {
    return 'actions';
  }
  return 'dashboard';
}

function actionFromHash(hash: string): ActionKind {
  const h = hash.replace('#', '');
  if (h === 'withdraw' || h === 'borrow' || h === 'repay') return h;
  return 'supply';
}

/**
 * Read the URL hash and return `{ view, action }`. SSR-safe (defaults
 * to dashboard/supply when window is unavailable).
 */
export function useHashRoute() {
  const [view, setView] = useState<View>('dashboard');
  const [action, setAction] = useState<ActionKind>('supply');

  useEffect(() => {
    const sync = () => {
      const h = window.location.hash;
      setView(viewFromHash(h));
      setAction(actionFromHash(h));
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  const setRoute = (v: View, a?: ActionKind) => {
    setView(v);
    if (typeof window === 'undefined') return;
    let target: string;
    if (v === 'actions') {
      const k = a ?? action;
      target = `#${k}`;
      setAction(k);
    } else {
      target = `#${v}`;
    }
    history.replaceState(null, '', target);
  };

  return { view, action, setRoute };
}
