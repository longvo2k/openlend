'use client';

import { PoolStats } from './PoolStats';
import { AccountStats } from './AccountStats';

export function DashboardView() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <PoolStats />
      <AccountStats />
    </div>
  );
}
