/**
 * The four pieces every analytics surface is built from.
 *
 * Deliberately small and unconfigurable: a metric block, a row of them, a
 * comparison chip and one chart. Beam is not getting a dashboard system, so
 * these take content rather than a layout description.
 */
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  NO_DATA,
  compareTo,
  formatBucket,
  type Granularity,
} from "@/lib/analytics";

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/** A row of metric blocks separated by hairlines. */
export function MetricRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * One figure. `value` is already formatted — the caller decides whether a
 * missing number reads as an em dash, because only the caller knows whether
 * zero is a real observation or an absence of one.
 */
export function Metric({
  label,
  value,
  hint,
  comparison,
}: {
  label: string;
  value: string;
  /** Small print under the value: units, denominator, sample size. */
  hint?: string;
  comparison?: ReturnType<typeof compareTo>;
}) {
  const missing = value === NO_DATA;

  return (
    <div className="flex flex-col gap-1 bg-background px-3 py-2.5">
      <span className="beam-meta uppercase tracking-wide">{label}</span>
      <span
        className={cn(
          "text-[19px] font-semibold leading-none tabular-nums",
          missing && "text-muted-foreground",
        )}
      >
        {value}
      </span>
      {comparison ? <Comparison comparison={comparison} /> : null}
      {hint && !comparison ? (
        <span className="beam-meta font-normal">{hint}</span>
      ) : null}
    </div>
  );
}

/**
 * "+3 vs previous". Colour is reserved for direction only — there is no claim
 * here that up is good, because for canceled issues it is not.
 */
export function Comparison({
  comparison,
  className,
}: {
  comparison: NonNullable<ReturnType<typeof compareTo>>;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "beam-meta font-normal",
        comparison.direction === "up" && "text-emerald-600 dark:text-emerald-500",
        comparison.direction === "down" && "text-muted-foreground",
        className,
      )}
    >
      {comparison.label}
    </span>
  );
}

/** Shown instead of a metric that needs observations it does not have. */
export function AnalyticsEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-24 items-center justify-center rounded-md border border-dashed border-border px-4 py-6">
      <span className="beam-meta font-normal">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Trend chart                                                                */
/* -------------------------------------------------------------------------- */

export type TrendPoint = { date: string; created: number; completed: number };

const CHART_HEIGHT = 96;
const GAP = 0.25; // Share of a slot left empty between buckets.

/**
 * Created against completed, as paired bars.
 *
 * Side by side rather than stacked or overlaid: the two series are independent
 * counts and a team can legitimately complete more than it creates in a day, so
 * anything that nests one inside the other would misrepresent that.
 *
 * Hand-drawn SVG rather than a charting library. Beam has recharts installed
 * but unused, and one fixed 90-bar chart does not justify the bundle or the
 * visual vocabulary that comes with it.
 */
export function TrendChart({
  data,
  granularity,
  className,
}: {
  data: TrendPoint[];
  granularity: Granularity;
  className?: string;
}) {
  const peak = Math.max(1, ...data.flatMap((d) => [d.created, d.completed]));
  const slot = data.length > 0 ? 100 / data.length : 100;
  const barWidth = (slot * (1 - GAP)) / 2;

  const totals = data.reduce(
    (sum, point) => ({
      created: sum.created + point.created,
      completed: sum.completed + point.completed,
    }),
    { created: 0, completed: 0 },
  );

  if (totals.created === 0 && totals.completed === 0) {
    return <AnalyticsEmpty>No activity in this period</AnalyticsEmpty>;
  }

  const y = (value: number) => CHART_HEIGHT - (value / peak) * CHART_HEIGHT;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-center justify-between">
        <Legend />
        <span className="beam-meta font-normal">peak {peak}</span>
      </div>

      <svg
        viewBox={`0 0 100 ${CHART_HEIGHT}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible"
        role="img"
        aria-label={`${totals.created} created and ${totals.completed} completed across ${data.length} ${granularity === "week" ? "weeks" : "days"}`}
      >
        <line
          x1="0"
          y1={CHART_HEIGHT}
          x2="100"
          y2={CHART_HEIGHT}
          className="stroke-border"
          strokeWidth="0.5"
          vectorEffect="non-scaling-stroke"
        />
        {data.map((point, index) => {
          const left = index * slot + (slot * GAP) / 2;
          return (
            <g key={point.date}>
              <title>
                {`${formatBucket(point.date, granularity)}: ${point.created} created, ${point.completed} completed`}
              </title>
              <rect
                x={left}
                y={y(point.created)}
                width={barWidth}
                height={CHART_HEIGHT - y(point.created)}
                className="fill-muted-foreground/35"
              />
              <rect
                x={left + barWidth}
                y={y(point.completed)}
                width={barWidth}
                height={CHART_HEIGHT - y(point.completed)}
                className="fill-primary"
              />
            </g>
          );
        })}
      </svg>

      <div className="flex items-center justify-between">
        <span className="beam-meta font-normal">
          {formatBucket(data[0]?.date ?? "", granularity)}
        </span>
        <span className="beam-meta font-normal">
          {formatBucket(data[data.length - 1]?.date ?? "", granularity)}
        </span>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <span className="flex items-center gap-3">
      <Swatch className="bg-muted-foreground/35" label="Created" />
      <Swatch className="bg-primary" label="Completed" />
    </span>
  );
}

function Swatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="beam-meta flex items-center gap-1.5 font-normal">
      <span className={cn("size-2 rounded-[2px]", className)} />
      {label}
    </span>
  );
}
