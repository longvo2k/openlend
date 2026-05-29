'use client';

import { useAccount, useBalance, useChainId, useReadContract } from 'wagmi';
import { lendingPoolAbi, getLendingPoolAddress } from '../lib/contract';
import { formatOPN, formatHF } from '../lib/format';

export function AccountStats() {
  const chainId = useChainId();
  const { address: user } = useAccount();
  const pool = getLendingPoolAddress(chainId);

  const { data: bal } = useBalance({ address: user, query: { refetchInterval: 5000 } });

  const { data: acct, isLoading } = useReadContract({
    address: pool ?? undefined,
    abi: lendingPoolAbi,
    functionName: 'getAccountData',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(user && pool), refetchInterval: 5000 },
  });

  // getAccountData returns (uint256 userCollateral, uint256 userDebt, uint256 hf, uint256 shares)
  const tuple = acct as [bigint, bigint, bigint, bigint] | undefined;
  const collateral = tuple?.[0];
  const debt = tuple?.[1];
  const hf = tuple?.[2];
  const shares = tuple?.[3];

  const hfFmt = formatHF(hf);
  const hfClass =
    hfFmt.tone === 'red'
      ? 'text-red-400'
      : hfFmt.tone === 'yellow'
      ? 'text-amber-300'
      : hfFmt.tone === 'green'
      ? 'text-emerald-400'
      : 'text-zinc-300';

  return (
    <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-6">
      <h2 className="text-xl font-semibold mb-4">Your account</h2>
      <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Stat label="Wallet balance" value={`${formatOPN(bal?.value)} OPN`} />
        <Stat label="Collateral" value={isLoading ? '…' : `${formatOPN(collateral)} OPN`} />
        <Stat label="Debt" value={isLoading ? '…' : `${formatOPN(debt)} OPN`} />
        <Stat label="Supply shares" value={isLoading ? '…' : formatOPN(shares)} />
        <Stat label="Health factor" value={isLoading ? '…' : hfFmt.text} valueClass={hfClass} />
      </dl>
    </section>
  );
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className={`text-lg font-medium ${valueClass ?? ''}`}>{value}</dd>
    </div>
  );
}
