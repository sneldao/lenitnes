import { cn } from '@/lib/utils';

/**
 * Tiny cumulative-P&L sparkline as an inline SVG. No chart lib —
 * 14 points and a polyline are enough for the scorecard hero.
 * Tone follows the final value (green up / red down / slate flat).
 */
export function PnlSparkline({
  points,
  className,
  width = 160,
  height = 40,
}: {
  /** Cumulative values, oldest → newest. */
  points: number[];
  className?: string;
  width?: number;
  height?: number;
}) {
  if (points.length < 2) return null;

  const min = Math.min(...points, 0);
  const max = Math.max(...points, 0);
  const span = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points
    .map((p, i) => `${(i * stepX).toFixed(1)},${(height - ((p - min) / span) * height).toFixed(1)}`)
    .join(' ');

  const last = points[points.length - 1]!;
  const stroke =
    last > 0.005 ? 'var(--color-signal, #34d399)' : last < -0.005 ? '#f87171' : '#64748b';
  const zeroY = height - ((0 - min) / span) * height;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn('overflow-visible', className)}
      aria-hidden="true"
    >
      <line
        x1={0}
        y1={zeroY}
        x2={width}
        y2={zeroY}
        stroke="#334155"
        strokeWidth="0.5"
        strokeDasharray="2 2"
      />
      <polyline
        points={coords}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
