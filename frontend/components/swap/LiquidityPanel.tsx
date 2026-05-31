'use client';

import { useEffect, useMemo, useState } from 'react';
import { maxUint256 } from 'viem';
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useReadContracts,
  useWriteContract,
} from 'wagmi';
import { Droplets } from 'lucide-react';
import {
  getMockUSDCAddress,
  getPairAddress,
  mockUSDCAbi,
  openSwapPairAbi,
} from '../../lib/contract';
import { iopnTestnet } from '../../lib/chains';
import {
  formatLP,
  formatMUSDC,
  formatOPN,
  parseLP,
  parseMUSDC,
  parseOPN,
} from '../../lib/format';
import { TokenInput } from '../ui/TokenInput';

type Mode = 'add' | 'remove';
type Phase = 'idle' | 'approving' | 'signing' | 'pending' | 'success';

const GAS_RESERVE_WEI = 100_000_000_000_000n; // 0.0001 OPN

export function LiquidityPanel() {
  const chainId = useChainId();
  const pair = getPairAddress(chainId);
  const mUSDC = getMockUSDCAddress(chainId);
  const publicClient = usePublicClient();
  const { address: user } = useAccount();

  const [mode, setMode] = useState<Mode>('add');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { writeContractAsync } = useWriteContract();

  // Reads needed for both modes.
  const { data: reservesData } = useReadContracts({
    contracts: pair
      ? [
          { address: pair, abi: openSwapPairAbi, functionName: 'getReserves' },
          { address: pair, abi: openSwapPairAbi, functionName: 'totalSupply' },
        ]
      : [],
    query: { refetchInterval: 5000, enabled: Boolean(pair) },
  });
  const reserves = reservesData?.[0]?.result as readonly [bigint, bigint, number] | undefined;
  const totalSupply = reservesData?.[1]?.result as bigint | undefined;
  const reserveOPN = reserves?.[0];
  const reserveMUSDC = reserves?.[1];

  // ----- Add mode state -----
  const [opnAmount, setOpnAmount] = useState('');
  const [musdcAmount, setMusdcAmount] = useState('');
  const [lastEdited, setLastEdited] = useState<'opn' | 'musdc'>('opn');

  const { data: balOPN } = useBalance({
    address: user,
    query: { enabled: Boolean(user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: balMUSDC } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(mUSDC && user && mode === 'add'), refetchInterval: 5000 },
  });
  const { data: allowanceRaw } = useReadContract({
    address: mUSDC ?? undefined,
    abi: mockUSDCAbi,
    functionName: 'allowance',
    args: user && pair ? [user, pair] : undefined,
    query: { enabled: Boolean(mUSDC && pair && user && mode === 'add'), refetchInterval: 5000 },
  });
  const allowance = (allowanceRaw as bigint | undefined) ?? 0n;

  // Auto-pair: when the pool has reserves, fill the other side to match the ratio.
  useEffect(() => {
    if (mode !== 'add') return;
    if (!reserveOPN || !reserveMUSDC || reserveOPN === 0n || reserveMUSDC === 0n) return;
    if (lastEdited === 'opn') {
      if (opnAmount === '') {
        setMusdcAmount('');
        return;
      }
      try {
        const opn = parseOPN(opnAmount);
        const musdc = (opn * reserveMUSDC) / reserveOPN;
        setMusdcAmount(formatMUSDC(musdc, 6));
      } catch {
        /* invalid input */
      }
    } else {
      if (musdcAmount === '') {
        setOpnAmount('');
        return;
      }
      try {
        const musdc = parseMUSDC(musdcAmount);
        const opn = (musdc * reserveOPN) / reserveMUSDC;
        setOpnAmount(formatOPN(opn, 18));
      } catch {
        /* invalid input */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opnAmount, musdcAmount, lastEdited, reserveOPN, reserveMUSDC, mode]);

  const parsedOPN: bigint | null = useMemo(() => {
    try { return opnAmount ? parseOPN(opnAmount) : null; } catch { return null; }
  }, [opnAmount]);
  const parsedMUSDC: bigint | null = useMemo(() => {
    try { return musdcAmount ? parseMUSDC(musdcAmount) : null; } catch { return null; }
  }, [musdcAmount]);

  const { data: quoteAddRaw } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'quoteAddLiquidity',
    args: parsedOPN && parsedMUSDC ? [parsedOPN, parsedMUSDC] : undefined,
    query: {
      enabled: Boolean(pair && parsedOPN && parsedOPN > 0n && parsedMUSDC && parsedMUSDC > 0n),
      refetchInterval: 5000,
    },
  });
  const quotedLP = (quoteAddRaw as readonly [bigint, bigint, bigint] | undefined)?.[0];

  // ----- Remove mode state -----
  const [lpText, setLpText] = useState('');
  const { data: userLP } = useReadContract({
    address: pair ?? undefined,
    abi: openSwapPairAbi,
    functionName: 'balanceOf',
    args: user ? [user] : undefined,
    query: { enabled: Boolean(pair && user && mode === 'remove'), refetchInterval: 5000 },
  });
  const parsedLP: bigint | null = useMemo(() => {
    try { return lpText ? parseLP(lpText) : null; } catch { return null; }
  }, [lpText]);

  const removePreview = useMemo(() => {
    if (!parsedLP || !totalSupply || totalSupply === 0n || !reserveOPN || !reserveMUSDC) {
      return null;
    }
    return {
      opnOut: (parsedLP * reserveOPN) / totalSupply,
      mUSDCOut: (parsedLP * reserveMUSDC) / totalSupply,
    };
  }, [parsedLP, totalSupply, reserveOPN, reserveMUSDC]);

  // ----- MAX helpers -----
  const opnMax: bigint | undefined = balOPN
    ? balOPN.value - GAS_RESERVE_WEI > 0n
      ? balOPN.value - GAS_RESERVE_WEI
      : 0n
    : undefined;
  const opnMaxFormatted = opnMax === undefined ? '—' : `${formatOPN(opnMax)} OPN`;
  const onMaxOPN = () => {
    if (!opnMax) return;
    setLastEdited('opn');
    setOpnAmount(formatOPN(opnMax, 18));
  };

  const musdcMax = balMUSDC as bigint | undefined;
  const musdcMaxFormatted = musdcMax === undefined ? '—' : `${formatMUSDC(musdcMax)} mUSDC`;
  const onMaxMUSDC = () => {
    if (!musdcMax) return;
    setLastEdited('musdc');
    setMusdcAmount(formatMUSDC(musdcMax, 6));
  };

  const lpMaxFormatted = userLP === undefined ? '—' : `${formatLP(userLP as bigint)} LP`;
  const onMaxLP = () => {
    if (!userLP) return;
    setLpText(formatLP(userLP as bigint, 18));
  };

  // ----- Submit -----
  const reset = () => {
    setOpnAmount('');
    setMusdcAmount('');
    setLpText('');
    setError(null);
    setPhase('idle');
    setTxHash(undefined);
  };

  const busy = phase !== 'idle' && phase !== 'success';

  const switchMode = (m: Mode) => {
    setMode(m);
    reset();
  };

  const onSubmit = async () => {
    if (!pair || !publicClient) {
      setError('No deployment for this network.');
      return;
    }
    setError(null);
    try {
      if (mode === 'add') {
        if (!parsedOPN || !parsedMUSDC || parsedOPN <= 0n || parsedMUSDC <= 0n) {
          throw new Error('Enter both amounts > 0');
        }
        if (allowance < parsedMUSDC) {
          if (!mUSDC) throw new Error('mUSDC address not found');
          setPhase('approving');
          const h0 = await writeContractAsync({
            address: mUSDC,
            abi: mockUSDCAbi,
            functionName: 'approve',
            args: [pair, maxUint256],
          });
          await publicClient.waitForTransactionReceipt({ hash: h0 });
        }
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'addLiquidity',
          args: [parsedMUSDC],
          value: parsedOPN,
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
        setPhase('success');
      } else {
        if (!parsedLP || parsedLP <= 0n) throw new Error('Enter LP > 0');
        setPhase('signing');
        const h = await writeContractAsync({
          address: pair,
          abi: openSwapPairAbi,
          functionName: 'removeLiquidity',
          args: [parsedLP],
        });
        setTxHash(h);
        setPhase('pending');
        await publicClient.waitForTransactionReceipt({ hash: h });
        setPhase('success');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('User rejected') ? 'Rejected in wallet.' : msg);
      setPhase('idle');
    }
  };

  const status =
    error ? `Error: ${error}` :
    phase === 'approving' ? 'Approve in wallet…' :
    phase === 'signing' ? 'Confirm in wallet…' :
    phase === 'pending' ? 'Pending…' :
    phase === 'success' ? 'Confirmed ✓' :
    '';
  const explorer = txHash ? `${iopnTestnet.blockExplorers.default.url}/tx/${txHash}` : null;

  const ctaLabel =
    mode === 'add'
      ? (parsedMUSDC && allowance < parsedMUSDC ? 'Approve & Add Liquidity' : 'Add Liquidity')
      : 'Remove Liquidity';

  return (
    <section className="relative overflow-hidden rounded-xl bg-white p-6">

      <header className="mb-5 flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 text-black">
          <Droplets className="h-5 w-5" aria-hidden />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Liquidity</h3>
          <p className="text-sm text-zinc-800">Provide both assets to earn 0.30% on every swap.</p>
        </div>
      </header>

      <div className="mb-4 inline-flex rounded-lg border border-zinc-300 bg-white p-1">
        <button
          type="button"
          onClick={() => switchMode('add')}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition ' +
            (mode === 'add' ? 'bg-black text-white' : 'text-zinc-700 hover:bg-zinc-100')
          }
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => switchMode('remove')}
          className={
            'rounded-md px-3 py-1 text-sm font-medium transition ' +
            (mode === 'remove' ? 'bg-black text-white' : 'text-zinc-700 hover:bg-zinc-100')
          }
        >
          Remove
        </button>
      </div>

      {mode === 'add' && (
        <div className="space-y-4">
          <TokenInput
            label="OPN amount"
            value={opnAmount}
            onChange={(s) => { setLastEdited('opn'); setOpnAmount(s); }}
            unit="OPN"
            disabled={busy}
            maxValue={opnMax}
            maxLabel="Wallet"
            maxFormatted={opnMaxFormatted}
            onMax={onMaxOPN}
            accent="emerald"
          />
          <TokenInput
            label="mUSDC amount"
            value={musdcAmount}
            onChange={(s) => { setLastEdited('musdc'); setMusdcAmount(s); }}
            unit="mUSDC"
            disabled={busy}
            maxValue={musdcMax}
            maxLabel="Wallet"
            maxFormatted={musdcMaxFormatted}
            onMax={onMaxMUSDC}
            accent="emerald"
          />
          <div className="text-xs text-zinc-700">
            You'll receive: <span className="text-zinc-900">{quotedLP === undefined ? '—' : `${formatLP(quotedLP)} LP`}</span>
          </div>
          <button
            onClick={onSubmit}
            disabled={busy || !pair || !parsedOPN || !parsedMUSDC}
            className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
          >
            {busy ? 'Working…' : ctaLabel}
          </button>
        </div>
      )}

      {mode === 'remove' && (
        <div className="space-y-4">
          <TokenInput
            label="LP to burn"
            value={lpText}
            onChange={setLpText}
            unit="LP"
            disabled={busy}
            maxValue={userLP as bigint | undefined}
            maxLabel="Available"
            maxFormatted={lpMaxFormatted}
            onMax={onMaxLP}
            accent="violet"
          />
          <div className="text-xs text-zinc-700">
            You'll receive: <span className="text-zinc-900">
              {removePreview
                ? `≈ ${formatOPN(removePreview.opnOut)} OPN + ${formatMUSDC(removePreview.mUSDCOut)} mUSDC`
                : '—'}
            </span>
          </div>
          <button
            onClick={onSubmit}
            disabled={busy || !pair || !parsedLP}
            className="w-full rounded-lg bg-black py-2.5 font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-black"
          >
            {busy ? 'Working…' : ctaLabel}
          </button>
        </div>
      )}

      {status && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-zinc-900">
          <span>{status}</span>
          {explorer && (
            <a className="text-emerald-700 underline hover:opacity-80" target="_blank" rel="noopener noreferrer" href={explorer}>
              view tx ↗
            </a>
          )}
          {phase === 'success' && (
            <button className="text-zinc-700 underline" onClick={reset}>reset</button>
          )}
        </div>
      )}
    </section>
  );
}
