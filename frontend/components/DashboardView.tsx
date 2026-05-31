'use client';

import { PoolStats } from './PoolStats';
import { AccountStats } from './AccountStats';
import { PoolHistoryChart } from './PoolHistoryChart';

export function DashboardView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PoolStats />
      <AccountStats />
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 sm:p-5 shadow-sm">
        <header className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">Pool history</h3>
          <span className="text-xs text-zinc-500">Net deposits and utilization since deploy</span>
        </header>
        <PoolHistoryChart />
      </section>
    </div>
  );
}
