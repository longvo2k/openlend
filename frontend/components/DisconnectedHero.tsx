'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface Pill {
  label: string;
  icon: LucideIcon;
}

const PILLS: Pill[] = [
  { label: 'Lend', icon: ArrowDownToLine },
  { label: 'Trade', icon: ArrowLeftRight },
  { label: 'Strategy', icon: Layers },
];

export function DisconnectedHero() {
  return (
    <section
      aria-labelledby="stratus-hero-title"
      className="relative flex flex-1 items-center justify-center px-4 py-12"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80"
        style={{
          background:
            'radial-gradient(60% 50% at 50% 0%, rgba(24,24,27,0.05), transparent 70%)',
        }}
      />

      <div className="relative flex max-w-xl flex-col items-center gap-4 text-center">
        <div className="text-sm font-extrabold tracking-[0.18em] text-zinc-900">
          STRATUS
        </div>

        <h1
          id="stratus-hero-title"
          className="text-4xl font-extrabold leading-[1.05] tracking-tight text-zinc-950 md:text-5xl"
        >
          DeFi suite,
          <br />
          on IOPN testnet.
        </h1>

        <p className="max-w-md text-base text-zinc-600">
          Lend, swap, and run leveraged LP, all on one app.
        </p>

        <ul className="mt-1 flex flex-wrap items-center justify-center gap-2">
          {PILLS.map(({ label, icon: Icon }) => (
            <li key={label}>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-sm font-semibold text-zinc-900">
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {label}
              </span>
            </li>
          ))}
        </ul>

        <ConnectButton.Custom>
          {({ openConnectModal, mounted }) => (
            <button
              type="button"
              onClick={openConnectModal}
              disabled={!mounted}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-7 py-3.5 text-base font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
            >
              Connect Wallet
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </ConnectButton.Custom>

        <div className="mt-2 flex flex-col items-center gap-1 text-sm text-zinc-500 sm:flex-row sm:gap-4">
          <span>
            Need OPN?{' '}
            <a
              href="https://faucet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              Get testnet tokens ↗
            </a>
          </span>
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span>
            <a
              href="https://testnet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline-offset-2 hover:underline"
            >
              View on explorer ↗
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
