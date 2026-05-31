import { useEffect, useMemo, useState } from 'react';

export interface PaginationState<T> {
  /** The slice of items for the current page. */
  pageItems: T[];
  /** Current page index (0-indexed). */
  page: number;
  /** Imperative setter for the current page. */
  setPage: (next: number) => void;
  /** Number of pages, minimum 1. */
  totalPages: number;
  /** Total item count across all pages. */
  total: number;
  /** 1-indexed position of the first item on the current page (0 when empty). */
  rangeStart: number;
  /** 1-indexed position of the last item on the current page. */
  rangeEnd: number;
  /** True when the dataset spans more than one page. */
  hasMultiplePages: boolean;
}

/**
 * Client-side pagination over an in-memory array.
 *
 * The hook owns the page index and reslices the array per render. When the
 * dataset shrinks (a refetch returns fewer items, or the user switches
 * wallet/chain and the list changes), the index auto-resets to 0 so the
 * caller never renders an empty page past the new end.
 *
 * Server-side pagination is out of scope: this is for views that already
 * fetch the full collection in one round trip (e.g. explorer-API event
 * logs) and just need to render it in chunks.
 */
export function usePagination<T>(items: readonly T[], pageSize: number): PaginationState<T> {
  const [page, setPage] = useState(0);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [page, totalPages]);

  const pageItems = useMemo<T[]>(() => {
    const start = page * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  const rangeStart = total === 0 ? 0 : page * pageSize + 1;
  const rangeEnd = Math.min(total, (page + 1) * pageSize);
  const hasMultiplePages = total > pageSize;

  return {
    pageItems,
    page,
    setPage,
    totalPages,
    total,
    rangeStart,
    rangeEnd,
    hasMultiplePages,
  };
}
