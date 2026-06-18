'use client';

import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

interface ZecPoint {
  t: number;
  price: number;
}

interface CoinGeckoResponse {
  prices: [number, number][];
}

const ZEC_TICKER =
  'https://api.coingecko.com/api/v3/coins/zcash/market_chart?vs_currency=usd&days=7';

async function fetchZecPrices(): Promise<ZecPoint[]> {
  const res = await fetch(ZEC_TICKER, { cache: 'no-store' });
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data: CoinGeckoResponse = await res.json();
  return data.prices.map(([t, price]) => ({ t, price }));
}

/**
 * Live ZEC price, 7-day window. Day 10 wires CoinGecko.
 * Falls back to the static Day 9 chart if the API is down
 * (rate limit, no network, etc.) so the case-study page never
 * goes blank.
 */
export function LiveZecChart({
  staticFallback,
  minP,
  maxP,
}: {
  staticFallback: { t: string; price: number; label?: string }[];
  minP: number;
  maxP: number;
}) {
  const { data, isLoading, isError } = useQuery<ZecPoint[]>({
    queryKey: ['coingecko', 'zcash', '7d'],
    queryFn: fetchZecPrices,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isError) {
    return (
      <ZecChart
        points={staticFallback.map((p) => ({ t: p.t, price: p.price, label: p.label }))}
        minP={minP}
        maxP={maxP}
      />
    );
  }
  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }
  return (
    <ZecChart
      points={data.map((p) => ({ t: new Date(p.t).toISOString().slice(0, 10), price: p.price }))}
      minP={minP}
      maxP={maxP}
    />
  );
}

function ZecChart({
  points,
  minP,
  maxP,
}: {
  points: { t: string; price: number; label?: string }[];
  minP: number;
  maxP: number;
}) {
  const range = maxP - minP;
  const W = 720;
  const H = 200;
  const padX = 20;
  const padY = 24;
  const innerW = W - padX * 2;
  const innerH = H - padY * 2;
  const stepX = innerW / (points.length - 1);
  const yOf = (p: number) => padY + innerH - ((p - minP) / range) * innerH;
  const xOf = (i: number) => padX + i * stepX;
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i)} ${yOf(p.price)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="ZEC price, 7d">
      {[0, 0.25, 0.5, 0.75, 1].map((g) => {
        const y = padY + innerH * g;
        return (
          <line
            key={g}
            x1={padX}
            y1={y}
            x2={W - padX}
            y2={y}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
          />
        );
      })}
      <path d={pathD} stroke="rgb(8, 145, 178)" strokeWidth={2} fill="none" />
      {points.map((p, i) => (
        <circle
          key={p.t}
          cx={xOf(i)}
          cy={yOf(p.price)}
          r={2.5}
          fill="rgb(8, 145, 178)"
          fillOpacity={0.6}
        />
      ))}
      <text
        x={4}
        y={padY + 6}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.5}
        className="font-mono"
      >
        ${maxP.toFixed(2)}
      </text>
      <text
        x={4}
        y={H - padY + 2}
        fontSize={9}
        fill="currentColor"
        fillOpacity={0.5}
        className="font-mono"
      >
        ${minP.toFixed(2)}
      </text>
    </svg>
  );
}
