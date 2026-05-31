'use client';

import { useSwitchChain } from 'wagmi';
import { ArrowRight } from 'lucide-react';
import { iopnTestnet } from '@/lib/chains';

export function WrongNetworkHero() {
  const { switchChain, isPending } = useSwitchChain();

  return (
    <section
      aria-labelledby="stratus-wrong-network-title"
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

      <div className="relative flex max-w-3xl flex-col items-center gap-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-900">
          Network warning
        </span>

        <div className="flex flex-col items-center gap-3">
          <h1
            id="stratus-wrong-network-title"
            className="text-3xl font-extrabold leading-[1.05] tracking-tight text-zinc-950 sm:text-4xl md:text-5xl"
          >
            Wrong network.
          </h1>

          <p className="max-w-md text-base text-zinc-600">
            Stratus lives on IOPN Testnet (chainId 984). Switch to keep going.
          </p>
        </div>

        <button
          type="button"
          onClick={() => switchChain({ chainId: iopnTestnet.id })}
          disabled={isPending}
          className="mt-3 inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-7 py-3.5 text-base font-bold text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Switching…' : 'Switch to IOPN Testnet'}
          {!isPending && <ArrowRight className="h-4 w-4" aria-hidden />}
        </button>

        <div className="mt-2 flex flex-col items-center gap-1 text-sm text-zinc-500 sm:flex-row sm:gap-4">
          <span>
            Need OPN?{' '}
            <a
              href="https://faucet.iopn.tech"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-zinc-900 underline underline-offset-2 decoration-zinc-300 hover:decoration-zinc-900"
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
              className="font-medium text-zinc-900 underline underline-offset-2 decoration-zinc-300 hover:decoration-zinc-900"
            >
              View on explorer ↗
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
