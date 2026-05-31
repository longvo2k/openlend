'use client';

import { useMemo, useState } from 'react';
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from 'wagmi';
import { Coins } from 'lucide-react';
import { getMockUSDCAddress, mockUSDCAbi } from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import { formatMUSDC, parseMUSDC } from '../../lib/format';
import { TokenInput } from '../ui/TokenInput';

type Phase = 'idle' | 'signing' | 'pending' | 'success';

export function FaucetPanel() {
  const chainId = useChainId();
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [text, setText] = useState('10000');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  const { data: capRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'MAX_MINT_PER_CALL',
    query: { enabled: Boolean(mUSDC) },
  });
  const cap = capRaw as bigint | undefined;
  const capFormatted = cap === undefined ? '—' : `${formatMUSDC(cap)} mUSDC`;

  const { data: balRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user), refetchInterval: 5000 },
  });
  const bal = balRaw as bigint | undefined;

  const parsed: bigint | null = useMemo(() => {
    try { return text ? parseMUSDC(text) : null; } catch { return null; }
  }, [text]);

  const overCap = cap !== undefined && parsed !== null && parsed > cap;
  const onMax = () => {
    if (!cap) return;
    setText(formatMUSDC(cap, 6));
  };

  const reset = () => {
    setText('10000');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase !== 'idle' && phase !== 'success';

  const onSubmit = async () => {
    if (!mUSDC || !publicClient) {
      setError('No mUSDC deployment for this network.');
      return;
    }
    if (!parsed || parsed <= 0n) {
      setError('Enter an amount > 0');
      return;
    }
    if (overCap) {
      setError(`Above ${capFormatted} cap`);
      return;
    }
    setError(null);
    try {
      setPhase('signing');
      const h = await writeContractAsync({
        address: mUSDC,
        abi: mockUSDCAbi,
        functionName: 'mint',
        args: [parsed],
      });
      setTxHash(h);
      setPhase('pending');
      await publicClient.waitForTransactionReceipt({ hash: h });
      setPhase('success');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? `Minted ✓ — balance ${bal === undefined ? '—' : formatMUSDC(bal)} mUSDC` :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-6">

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-black">
          <Coins className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Faucet</h3>
          <p className="text-sm text-zinc-800">Mint test mUSDC. Max {capFormatted} per call.</p>
        </div>
      </header>

      <div className="space-y-4">
        <TokenInput
          label="Amount"
          value={text}
          onChange={setText}
          unit="mUSDC"
          disabled={busy}
          maxValue={cap}
          maxLabel="Cap"
          maxFormatted={capFormatted}
          onMax={onMax}
          accent="amber"
        />

        {overCap && (
          <div className="text-xs text-zinc-900">Above {capFormatted} cap — lower the amount.</div>
        )}

        <button
          onClick={onSubmit}
          disabled={busy || overCap || !mUSDC || !parsed}
          className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
        >
          {busy ? 'Working…' : 'Mint mUSDC'}
        </button>

        {status && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-900">
            <span>{status}</span>
            {explorer && (
              <a className="text-zinc-900 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
                view tx ↗
              </a>
            )}
            {phase === 'success' && (
              <button className="text-zinc-700 underline" onClick={reset}>reset</button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
