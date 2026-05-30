'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Route } from '../lib/route';

interface NavItem {
  route: Route;
  label: string;
  /** Active-state Tailwind classes for the pill background. */
  active: string;
  /** Small leading glyph (kept tiny — Unicode, not SVG). */
  glyph: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    title: 'Lend',
    items: [
      { route: 'lend:dashboard', label: 'Dashboard', active: 'bg-zinc-200 text-black', glyph: '◧' },
      { route: 'lend:supply', label: 'Supply', active: 'bg-emerald-500 text-black', glyph: '↓' },
      { route: 'lend:withdraw', label: 'Withdraw', active: 'bg-sky-500 text-black', glyph: '↑' },
      { route: 'lend:borrow', label: 'Borrow', active: 'bg-amber-500 text-black', glyph: '↗' },
      { route: 'lend:repay', label: 'Repay', active: 'bg-violet-500 text-black', glyph: '✓' },
      { route: 'lend:liquidate', label: 'Liquidate', active: 'bg-red-500 text-black', glyph: '⚡' },
      { route: 'lend:history', label: 'History', active: 'bg-zinc-400 text-black', glyph: '≡' },
    ],
  },
  {
    title: 'Swap',
    items: [
      { route: 'swap:swap', label: 'Swap', active: 'bg-emerald-500 text-black', glyph: '↔' },
      { route: 'swap:liquidity', label: 'Liquidity', active: 'bg-violet-500 text-black', glyph: '≋' },
      { route: 'swap:faucet', label: 'Faucet', active: 'bg-amber-500 text-black', glyph: '$' },
    ],
  },
];

interface Props {
  route: Route;
  onChange: (r: Route) => void;
}

export function Sidebar({ route, onChange }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close drawer on route change.
  useEffect(() => {
    setMobileOpen(false);
  }, [route]);

  // Lock body scroll when the mobile drawer is open.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (mobileOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile hamburger button — only visible <md */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 shadow-lg md:hidden"
        aria-label="Open menu"
      >
        <span className="text-lg leading-none">☰</span>
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-800 bg-zinc-950/95 backdrop-blur transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ' +
          (mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-4">
          <Image
            src="/logo.png"
            alt="OpenLend"
            width={400}
            height={120}
            priority
            className="h-8 w-auto"
          />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 md:hidden"
            aria-label="Close menu"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" role="navigation">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = item.route === route;
                  return (
                    <li key={item.route}>
                      <button
                        type="button"
                        onClick={() => onChange(item.route)}
                        aria-current={isActive ? 'page' : undefined}
                        className={
                          'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ' +
                          (isActive
                            ? item.active
                            : 'text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-100')
                        }
                      >
                        <span
                          className={
                            'flex h-5 w-5 items-center justify-center text-base ' +
                            (isActive ? '' : 'text-zinc-500')
                          }
                          aria-hidden
                        >
                          {item.glyph}
                        </span>
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-zinc-800 px-4 py-3 space-y-1.5 text-xs">
          <a
            href="https://github.com/longvo2k/openlend"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-500 hover:text-zinc-200"
          >
            GitHub ↗
          </a>
          <a
            href="https://testnet.iopn.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-500 hover:text-zinc-200"
          >
            Explorer ↗
          </a>
          <a
            href="https://faucet.iopn.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-500 hover:text-zinc-200"
          >
            OPN faucet ↗
          </a>
        </div>
      </aside>
    </>
  );
}
