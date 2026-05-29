'use client';

import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function Home() {
  return (
    <main className="max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">OpenLend</h1>
        <ConnectButton />
      </header>
      <p className="text-zinc-400">Wallet provider wired. Dashboard next.</p>
    </main>
  );
}
