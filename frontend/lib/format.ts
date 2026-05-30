import { formatUnits, parseUnits, maxUint256 } from 'viem';

/* ----------------------------- Formatters ----------------------------- */

function fmt(value: bigint | undefined, unitDecimals: number, displayDecimals: number): string {
  if (value === undefined) return '—';
  const full = formatUnits(value, unitDecimals);
  const [intPart, fracPart = ''] = full.split('.');
  if (displayDecimals <= 0) return intPart;
  return `${intPart}.${(fracPart + '0'.repeat(displayDecimals)).slice(0, displayDecimals)}`;
}

export function formatOPN(wei: bigint | undefined, decimals = 4): string {
  return fmt(wei, 18, decimals);
}

/** mUSDC is 6-decimals (matches real USDC). */
export function formatMUSDC(value: bigint | undefined, decimals = 2): string {
  return fmt(value, 6, decimals);
}

/** LP token is 18-decimals (OpenZeppelin ERC20 default). */
export function formatLP(value: bigint | undefined, decimals = 4): string {
  return fmt(value, 18, decimals);
}

/* ----------------------------- Parsers ----------------------------- */

export function parseOPN(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

export function parseMUSDC(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 6);
}

export function parseLP(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

/* ----------------------------- Misc helpers ----------------------------- */

export function formatHF(hf: bigint | undefined): { text: string; tone: 'green' | 'yellow' | 'red' | 'neutral' } {
  if (hf === undefined) return { text: '—', tone: 'neutral' };
  if (hf === maxUint256) return { text: '∞', tone: 'green' };
  const asNum = Number(formatUnits(hf, 18));
  const text = asNum.toFixed(2);
  if (asNum < 1) return { text, tone: 'red' };
  if (asNum < 1.2) return { text, tone: 'yellow' };
  return { text, tone: 'green' };
}

export function bpsToPct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function utilization(supplied: bigint | undefined, borrowed: bigint | undefined): string {
  if (!supplied || supplied === 0n) return '0.00%';
  if (!borrowed) return '0.00%';
  const pct = (Number(borrowed) / Number(supplied)) * 100;
  return `${pct.toFixed(2)}%`;
}

/**
 * Slippage helper for the AMM. `minOut = quote × (10000 − slippageBps) / 10000`.
 * Caller should clamp `slippageBps` to a sensible range (0..5000 = 0..50%).
 */
export function applySlippage(quote: bigint, slippageBps: number): bigint {
  const bps = BigInt(Math.max(0, Math.min(10000, Math.floor(slippageBps))));
  return (quote * (10000n - bps)) / 10000n;
}
