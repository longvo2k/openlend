'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutGrid,
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowUpRight,
  Check,
  Zap,
  History,
  ArrowLeftRight,
  Droplets,
  Coins,
  Layers,
  Briefcase,
} from 'lucide-react';
import type { Route } from '@/lib/route';

interface NavItem {
  route: Route;
  label: string;
  /** Active-state Tailwind classes for the pill background. */
  active: string;
  /** Leading Lucide icon for the row. */
  icon: LucideIcon;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const ACTIVE_PILL = 'bg-black text-white';

const GROUPS: NavGroup[] = [
  {
    title: 'Lending',
    items: [
      { route: 'lend:dashboard', label: 'Dashboard', active: ACTIVE_PILL, icon: LayoutGrid },
      { route: 'lend:supply', label: 'Supply', active: ACTIVE_PILL, icon: ArrowDownToLine },
      { route: 'lend:withdraw', label: 'Withdraw', active: ACTIVE_PILL, icon: ArrowUpFromLine },
      { route: 'lend:borrow', label: 'Borrow', active: ACTIVE_PILL, icon: ArrowUpRight },
      { route: 'lend:repay', label: 'Repay', active: ACTIVE_PILL, icon: Check },
      { route: 'lend:liquidate', label: 'Liquidate', active: ACTIVE_PILL, icon: Zap },
      { route: 'lend:history', label: 'History', active: ACTIVE_PILL, icon: History },
    ],
  },
  {
    title: 'Trade',
    items: [
      { route: 'swap:swap', label: 'Swap', active: ACTIVE_PILL, icon: ArrowLeftRight },
      { route: 'swap:liquidity', label: 'Liquidity', active: ACTIVE_PILL, icon: Droplets },
      { route: 'swap:faucet', label: 'Faucet', active: ACTIVE_PILL, icon: Coins },
    ],
  },
  {
    title: 'Strategy',
    items: [
      { route: 'strategy:positions', label: 'Positions', active: ACTIVE_PILL, icon: Briefcase },
      { route: 'strategy:leveraged-lp', label: 'Leveraged LP', active: ACTIVE_PILL, icon: Layers },
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
        className="fixed left-3 top-3 z-30 flex h-9 w-9 items-center justify-center rounded-md border border-zinc-300 bg-white text-black shadow-lg md:hidden"
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
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-zinc-200 bg-white/95 backdrop-blur transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0 ' +
          (mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0')
        }
        aria-label="Navigation"
      >
        <div className="flex items-center justify-between gap-2 border-b border-zinc-200 px-4 py-4">
          <Image
            src="/stratus-logo.svg"
            alt="Stratus"
            width={240}
            height={64}
            priority
            className="h-8 w-auto"
          />
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-black hover:bg-zinc-100 md:hidden"
            aria-label="Close menu"
          >
            <span className="text-lg leading-none">×</span>
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6" role="navigation">
          {GROUPS.map((group) => (
            <div key={group.title}>
              <div className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                {group.title}
              </div>
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const isActive = item.route === route;
                  const Icon = item.icon;
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
                            : 'text-zinc-700 hover:bg-zinc-100 hover:text-black')
                        }
                      >
                        <span
                          className={
                            'flex h-5 w-5 items-center justify-center ' +
                            (isActive ? 'text-white' : 'text-black')
                          }
                          aria-hidden
                        >
                          <Icon className="h-4 w-4" aria-hidden />
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

        <div className="border-t border-zinc-200 px-4 py-3 space-y-1.5 text-xs">
          <a
            href="https://github.com/longvo2k/stratus"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-600 hover:text-black"
          >
            GitHub ↗
          </a>
          <a
            href="https://testnet.iopn.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-600 hover:text-black"
          >
            Explorer ↗
          </a>
          <a
            href="https://faucet.iopn.tech"
            target="_blank"
            rel="noopener noreferrer"
            className="block text-zinc-600 hover:text-black"
          >
            OPN faucet ↗
          </a>
        </div>
      </aside>
    </>
  );
}
