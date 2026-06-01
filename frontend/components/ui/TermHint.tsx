'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { getGlossaryEntry } from '@/lib/glossary';

export interface TermHintProps {
  term: string;
  children?: ReactNode;
  iconSize?: number;
}

const POPOVER_WIDTH = 288;
const VIEWPORT_MARGIN = 8;
const VERTICAL_GAP = 8;

export function TermHint({ term, children, iconSize = 14 }: TermHintProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const entry = getGlossaryEntry(term);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setCoords(null);
      return;
    }
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const overflowsRight = r.left + POPOVER_WIDTH + VIEWPORT_MARGIN > vw;
      let left = overflowsRight ? r.right - POPOVER_WIDTH : r.left;
      left = Math.max(
        VIEWPORT_MARGIN,
        Math.min(left, vw - POPOVER_WIDTH - VIEWPORT_MARGIN),
      );
      setCoords({ top: r.bottom + VERTICAL_GAP, left });
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('resize', update);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  if (!entry) {
    return <>{children}</>;
  }

  return (
    <span className="inline-flex items-center gap-1">
      {children && (
        <span className="cursor-help underline decoration-dotted decoration-zinc-400 underline-offset-2">
          {children}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`What is ${entry.term}?`}
        aria-expanded={open}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-zinc-500 transition hover:bg-zinc-100 hover:text-black focus:outline-none focus:ring-2 focus:ring-zinc-300"
      >
        <Info style={{ width: iconSize, height: iconSize }} aria-hidden />
      </button>

      {mounted && open && coords &&
        createPortal(
          <div
            ref={popoverRef}
            role="tooltip"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: POPOVER_WIDTH,
              maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
            }}
            className="z-[60] rounded-lg border border-zinc-200 bg-white p-3 text-left text-xs leading-relaxed text-zinc-800 shadow-lg"
          >
            <span className="mb-1 block text-sm font-semibold text-black">
              {entry.term}
            </span>
            <span className="block">{entry.short}</span>
            {entry.full && (
              <span className="mt-1.5 block text-zinc-600">{entry.full}</span>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
