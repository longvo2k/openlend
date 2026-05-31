'use client';

import { useEffect, useState } from 'react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { useLendingPoolHistory, type PoolHistoryPoint } from '@/lib/pool-history';
import { formatOPN } from '@/lib/format';

const CHART_HEIGHT = 260;

interface ChartDatum {
  ts: number;
  totalSupplyOPN: number;
  utilization: number;
  label: string;
}

function toChartData(points: PoolHistoryPoint[]): ChartDatum[] {
  return points.map((p) => ({
    ts: p.ts,
    totalSupplyOPN: Number(p.totalSupply) / 1e18,
    utilization: p.utilization,
    label: new Date(p.ts * 1000).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
    }),
  }));
}

export function PoolHistoryChart() {
  // Recharts hits window/document on mount; defer to client render.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading, isError, refetch } = useLendingPoolHistory();

  if (!mounted || isLoading) {
    return (
      <div
        className="w-full animate-pulse rounded-xl bg-zinc-100"
        style={{ height: CHART_HEIGHT }}
        aria-label="Loading pool history"
      />
    );
  }

  if (isError) {
    return (
      <div
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 text-sm text-red-800"
        style={{ height: CHART_HEIGHT }}
      >
        <span>Could not load pool history.</span>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-900 hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div
        className="flex w-full items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white text-sm text-zinc-600"
        style={{ height: CHART_HEIGHT }}
      >
        No activity yet. Supply or borrow to populate the chart.
      </div>
    );
  }

  const chartData = toChartData(data);

  return (
    <div style={{ width: '100%', height: CHART_HEIGHT }}>
      <ResponsiveContainer>
        <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid stroke="#f4f4f5" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
          />
          <YAxis
            yAxisId="supply"
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
            tickFormatter={(v: number) => formatOPN(BigInt(Math.round(v * 1e18)), 2)}
            width={64}
          />
          <YAxis
            yAxisId="util"
            orientation="right"
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: '#52525b' }}
            stroke="#d4d4d8"
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            width={48}
          />
          <Tooltip
            formatter={(value: number | string, name: string) => {
              if (name === 'Net deposits (OPN)') {
                const num = typeof value === 'number' ? value : Number(value);
                return [formatOPN(BigInt(Math.round(num * 1e18)), 4) + ' OPN', name];
              }
              if (name === 'Utilization') {
                const num = typeof value === 'number' ? value : Number(value);
                return [`${num.toFixed(2)}%`, name];
              }
              return [value, name];
            }}
            labelFormatter={(label) => `As of ${label}`}
            contentStyle={{ fontSize: 12 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            yAxisId="supply"
            dataKey="totalSupplyOPN"
            name="Net deposits (OPN)"
            type="monotone"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            yAxisId="util"
            dataKey="utilization"
            name="Utilization"
            type="monotone"
            stroke="#dc2626"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
