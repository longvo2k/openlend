'use client';

import { useEffect, useState } from 'react';

export type Route =
  | 'lend:dashboard'
  | 'lend:supply'
  | 'lend:withdraw'
  | 'lend:borrow'
  | 'lend:repay'
  | 'lend:liquidate'
  | 'lend:history'
  | 'swap:swap'
  | 'swap:liquidity'
  | 'swap:faucet';

export type Section = 'lend' | 'swap';
export type ActionKind = 'supply' | 'withdraw' | 'borrow' | 'repay';

export function sectionOf(route: Route): Section {
  return route.startsWith('swap:') ? 'swap' : 'lend';
}

/* ----------------------------- Hash routing -----------------------------
 * Flat hash format. Each route maps 1:1 to a hash so direct links work:
 *
 *   #dashboard | #supply | #withdraw | #borrow | #repay | #liquidate | #history
 *   #swap      | #liquidity | #faucet
 *
 * Unknown / missing hash defaults to lend:dashboard.
 */

const HASH_TO_ROUTE: Record<string, Route> = {
  dashboard: 'lend:dashboard',
  supply: 'lend:supply',
  withdraw: 'lend:withdraw',
  borrow: 'lend:borrow',
  repay: 'lend:repay',
  liquidate: 'lend:liquidate',
  history: 'lend:history',
  swap: 'swap:swap',
  liquidity: 'swap:liquidity',
  faucet: 'swap:faucet',
};

const ROUTE_TO_HASH: Record<Route, string> = Object.fromEntries(
  Object.entries(HASH_TO_ROUTE).map(([k, v]) => [v, k]),
) as Record<Route, string>;

function routeFromHash(hash: string): Route {
  const h = hash.replace('#', '');
  return HASH_TO_ROUTE[h] ?? 'lend:dashboard';
}

export function useHashRoute(): {
  route: Route;
  setRoute: (r: Route) => void;
} {
  const [route, setRoute] = useState<Route>('lend:dashboard');

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);

  return {
    route,
    setRoute(r: Route) {
      setRoute(r);
      if (typeof window !== 'undefined') {
        history.replaceState(null, '', `#${ROUTE_TO_HASH[r]}`);
      }
    },
  };
}
