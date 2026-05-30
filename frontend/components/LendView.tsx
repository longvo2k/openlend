'use client';

import { LendSubNav, type ActionKind, type LendView as LendViewKind } from './MainNav';
import { DashboardView } from './DashboardView';
import { ActionsView } from './ActionsView';
import { LiquidatePanel } from './LiquidatePanel';
import { HistoryView } from './HistoryView';

interface Props {
  view: LendViewKind;
  action: ActionKind;
  onViewChange: (v: LendViewKind, a?: ActionKind) => void;
  onActionChange: (k: ActionKind) => void;
}

export function LendView({ view, action, onViewChange, onActionChange }: Props) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <LendSubNav active={view} onChange={(v) => onViewChange(v)} />

      {view === 'dashboard' && <DashboardView />}
      {view === 'actions' && <ActionsView action={action} onChange={onActionChange} />}
      {view === 'liquidate' && <LiquidatePanel />}
      {view === 'history' && <HistoryView />}
    </div>
  );
}
