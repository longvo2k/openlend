'use client';

import { useUserHistory, type EventKind, type HistoryEvent } from '@/lib/history';
import { iopnTestnet } from '@/lib/chains';
import { formatOPN } from '@/lib/format';
import { usePagination } from '@/lib/use-pagination';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 10;

interface KindMeta {
  label: string;
  // Sign of the OPN flow from the user's perspective for the label color.
  // 'in' = user received OPN; 'out' = user sent OPN; 'risk' = liquidation.
  flow: 'in' | 'out' | 'risk';
  icon: string;
}

const KIND_META: Record<EventKind, KindMeta> = {
  Supplied: { label: 'Supply', flow: 'out', icon: '↓' },
  Withdrawn: { label: 'Withdraw', flow: 'in', icon: '↑' },
  CollateralDeposited: { label: 'Deposit collateral', flow: 'out', icon: '⊕' },
  CollateralWithdrawn: { label: 'Withdraw collateral', flow: 'in', icon: '⊖' },
  Borrowed: { label: 'Borrow', flow: 'in', icon: '→' },
  Repaid: { label: 'Repay', flow: 'out', icon: '←' },
  LiquidatedByMe: { label: 'Liquidation (by you)', flow: 'in', icon: '⚡' },
  LiquidatedAgainstMe: { label: 'Liquidated (against you)', flow: 'risk', icon: '⚡' },
};

const FLOW_TEXT: Record<KindMeta['flow'], string> = {
  in: 'text-emerald-700',
  out: 'text-sky-700',
  risk: 'text-red-700',
};

const FLOW_BG: Record<KindMeta['flow'], string> = {
  in: 'bg-zinc-100',
  out: 'bg-zinc-100',
  risk: 'bg-zinc-100',
};

const SIGN: Record<KindMeta['flow'], string> = {
  in: '+',
  out: '−',
  risk: '−',
};

function shortAddr(a: `0x${string}` | undefined): string {
  if (!a) return '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function formatRelative(ts: number): string {
  if (!ts) return '…';
  const diffSec = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

export function HistoryView() {
  const { data: events, isLoading, error, refetch, isFetching } = useUserHistory();
  const pagination = usePagination<HistoryEvent>(events ?? [], PAGE_SIZE);

  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-4 sm:p-6">

      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-black text-lg font-bold">
            ≡
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">Activity</h3>
            <p className="mt-0.5 text-sm text-zinc-800">
              Your past supplies, borrows, repays, and liquidations.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={isFetching}
          className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-50"
        >
          {isFetching ? '…' : 'Refresh'}
        </button>
      </header>

      {error && (
        <p className="text-sm text-red-700">
          Failed to load history: {error instanceof Error ? error.message : String(error)}
        </p>
      )}

      {isLoading && !events && (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-zinc-200 bg-zinc-100"
            />
          ))}
        </div>
      )}

      {events && events.length === 0 && !isLoading && (
        <p className="text-sm text-zinc-700">
          No activity yet. Your supplies, borrows, repays, and liquidations
          on the IOPN testnet pool will appear here.
        </p>
      )}

      {events && events.length > 0 && (
        <>
          <ul className="divide-y divide-zinc-200">
            {pagination.pageItems.map((e) => (
              <Row key={`${e.txHash}-${e.logIndex}`} event={e} />
            ))}
          </ul>

          {pagination.hasMultiplePages && (
            <Pagination
              className="mt-4"
              page={pagination.page}
              totalPages={pagination.totalPages}
              total={pagination.total}
              rangeStart={pagination.rangeStart}
              rangeEnd={pagination.rangeEnd}
              onPageChange={pagination.setPage}
              ariaLabel="History pagination"
            />
          )}
        </>
      )}
    </section>
  );
}

function Row({ event }: { event: HistoryEvent }) {
  const meta = KIND_META[event.kind];
  const flowText = FLOW_TEXT[meta.flow];
  const flowBg = FLOW_BG[meta.flow];
  const sign = SIGN[meta.flow];

  const explorer = `${iopnTestnet.blockExplorers.default.url}/tx/${event.txHash}`;

  // Extra contextual fragment per kind.
  let detail: string | null = null;
  if (event.kind === 'Supplied' && event.extra.shares !== undefined) {
    detail = `${formatOPN(event.extra.shares)} shares minted`;
  } else if (event.kind === 'Withdrawn' && event.extra.shares !== undefined) {
    detail = `${formatOPN(event.extra.shares)} shares burned`;
  } else if (event.kind === 'LiquidatedByMe') {
    detail =
      `${shortAddr(event.extra.counterparty)} liquidated` +
      (event.extra.seized !== undefined
        ? ` · seized ${formatOPN(event.extra.seized)} OPN`
        : '');
  } else if (event.kind === 'LiquidatedAgainstMe') {
    detail =
      `liquidator ${shortAddr(event.extra.counterparty)}` +
      (event.extra.seized !== undefined
        ? ` · seized ${formatOPN(event.extra.seized)} OPN`
        : '');
  }

  return (
    <li className="flex items-center gap-3 py-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${flowBg} ${flowText} text-sm font-bold`}
      >
        {meta.icon}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-sm font-medium text-black">
            {meta.label}
          </span>
          <span
            className={`shrink-0 text-sm font-semibold tabular-nums ${flowText}`}
          >
            {sign}{formatOPN(event.amount)} <span className="text-xs text-zinc-700">OPN</span>
          </span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-700">
          <span>{formatRelative(event.timestamp)}</span>
          <span>·</span>
          <span>block #{event.blockNumber.toString()}</span>
          {detail && (
            <>
              <span>·</span>
              <span className="truncate">{detail}</span>
            </>
          )}
          <span>·</span>
          <a
            className="text-zinc-900 underline hover:text-black"
            href={explorer}
            target="_blank"
            rel="noopener noreferrer"
          >
            tx ↗
          </a>
        </div>
      </div>
    </li>
  );
}
