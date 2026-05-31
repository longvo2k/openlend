'use client';

import Image from 'next/image';

/**
 * Full-screen branded loader shown during the brief window between
 * page load and React hydration. The parent component (app/page.tsx)
 * gates this behind a `mounted` state, so it only ever renders on
 * the server pass plus the first client paint, then disappears as
 * soon as wagmi/RainbowKit and the rest of the tree come alive.
 */
export function LoadingScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white"
      role="status"
      aria-label="Loading Stratus"
    >
      <Image
        src="/stratus-logo.svg"
        alt="Stratus"
        width={240}
        height={64}
        priority
        className="h-10 w-auto animate-pulse"
      />
      <div className="mt-6 flex items-center gap-1.5" aria-hidden>
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-900 [animation-delay:-0.3s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-900 [animation-delay:-0.15s]" />
        <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-900" />
      </div>
    </div>
  );
}
