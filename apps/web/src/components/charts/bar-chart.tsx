import type { ReactNode } from 'react';

/**
 * Dependency-free bar chart — a pure **server component** rendered with plain
 * CSS-height bars (no `<svg>` text-scaling pitfalls, fully responsive) and
 * themed entirely with M3 role tokens. Built for the host dashboard's revenue /
 * registrations trends (see `apps/web/src/app/host`), but generic enough to
 * reuse anywhere a small categorical bar chart is needed.
 *
 * Deterministic given props — no `Date.now()` / random reads in render (React
 * Compiler rule #4). Negative values (e.g. a refund-heavy revenue month) grow
 * downward from a shared zero baseline; all-positive data anchors to the bottom.
 */

export type BarDatum = {
  /** Axis label under the bar (e.g. `Jun '26`). */
  label: string;
  value: number;
};

const PLOT_HEIGHT = 'h-28'; // 112px plot area

export function BarChart({
  data,
  formatValue = (n) => String(n),
  ariaLabel,
  emptyText = 'No data yet.',
}: {
  data: ReadonlyArray<BarDatum>;
  /** Render the per-bar value label + the bar `title` (hover) text. */
  formatValue?: (value: number) => string;
  ariaLabel: string;
  emptyText?: ReactNode;
}) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <p className="text-muted text-sm">{emptyText}</p>;
  }

  // Zero-baseline scaling: positive bars rise from the zero line, negative bars
  // drop from it. `max`/`min` are clamped to include 0 so the baseline is real.
  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const range = max - min || 1;
  const zeroTopPct = (max / range) * 100;

  return (
    <div role="img" aria-label={ariaLabel}>
      <div className={`flex items-stretch gap-1.5 ${PLOT_HEIGHT}`}>
        {data.map((d, i) => {
          const isNeg = d.value < 0;
          const magPct = (Math.abs(d.value) / range) * 100;
          const style = isNeg
            ? { top: `${zeroTopPct}%`, height: `${magPct}%` }
            : { top: `${Math.max(0, zeroTopPct - magPct)}%`, height: `${magPct}%` };
          return (
            <div key={`${d.label}-${i}`} className="relative min-w-0 flex-1">
              <div
                className={`absolute inset-x-0 ${
                  isNeg ? 'bg-md-error rounded-b-sm' : 'bg-primary rounded-t-sm'
                } ${d.value === 0 ? 'opacity-0' : ''}`}
                style={style}
                title={`${d.label}: ${formatValue(d.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {data.map((d, i) => (
          <div key={`${d.label}-${i}-lbl`} className="min-w-0 flex-1 text-center">
            <p className="text-fg truncate text-[11px] font-medium tabular-nums">
              {formatValue(d.value)}
            </p>
            <p className="text-muted truncate text-[10px]">{d.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
