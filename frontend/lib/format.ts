import { formatUnits, parseUnits, maxUint256 } from 'viem';

export function formatOPN(wei: bigint | undefined, decimals = 4): string {
  if (wei === undefined) return '—';
  const full = formatUnits(wei, 18);
  const [intPart, fracPart = ''] = full.split('.');
  if (decimals <= 0) return intPart;
  return `${intPart}.${(fracPart + '0'.repeat(decimals)).slice(0, decimals)}`;
}

export function parseOPN(s: string): bigint {
  if (!s || s.trim() === '') throw new Error('empty');
  return parseUnits(s.trim(), 18);
}

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
