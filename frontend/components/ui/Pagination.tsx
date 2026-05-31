'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PaginationProps {
  /** Current page (0-indexed). */
  page: number;
  /** Total number of pages, minimum 1. */
  totalPages: number;
  /** Total item count across all pages, for the "of N" indicator. */
  total: number;
  /** 1-indexed position of the first item on the current page. */
  rangeStart: number;
  /** 1-indexed position of the last item on the current page. */
  rangeEnd: number;
  /** Imperative setter for the page. */
  onPageChange: (next: number) => void;
  /** Optional accessible label override for the nav landmark. */
  ariaLabel?: string;
  /** Optional class overrides on the nav element. */
  className?: string;
}

/**
 * Stateless prev / next pagination control.
 *
 * Pair with the `usePagination` hook for state and slicing. This component
 * just renders the indicator and the two buttons; it does not own a page
 * counter and does not slice data.
 */
export function Pagination({
  page,
  totalPages,
  total,
  rangeStart,
  rangeEnd,
  onPageChange,
  ariaLabel = 'Pagination',
  className,
}: PaginationProps) {
  const isFirst = page === 0;
  const isLast = page >= totalPages - 1;

  return (
    <nav
      aria-label={ariaLabel}
      className={
        'flex items-center justify-between gap-3 border-t border-zinc-200 pt-3 text-xs text-zinc-700' +
        (className ? ` ${className}` : '')
      }
    >
      <span className="tabular-nums">
        {rangeStart}-{rangeEnd} of {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPageChange(Math.max(0, page - 1))}
          disabled={isFirst}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Previous page"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
        </button>
        <span className="px-2 tabular-nums">
          page {page + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
          disabled={isLast}
          className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-900 transition hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Next page"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    </nav>
  );
}
