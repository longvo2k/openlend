'use client';

export function LeveragedLPPanel() {
  return (
    <section className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-cyan-500/60 via-transparent to-transparent" />

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 text-lg font-bold">
          ⏃
        </div>
        <div>
          <h3 className="text-lg font-semibold">Leveraged LP</h3>
          <p className="text-sm text-zinc-400">
            Lock OPN as collateral, borrow OPN, pair with mUSDC, earn 0.30% LP
            fees on the borrowed capital. Four signed transactions (three when
            mUSDC is already approved).
          </p>
        </div>
      </header>

      <p className="text-sm text-zinc-500">Coming together piece by piece — see the next tasks.</p>
    </section>
  );
}
