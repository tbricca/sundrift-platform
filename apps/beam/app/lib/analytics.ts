/**
 * The pure half of analytics: turning a URL range into dates, and turning
 * numbers into the short strings Beam puts on screen.
 *
 * Nothing here touches the database. The SQL definitions of the metrics live in
 * `server/analytics.ts`; this file only decides how they are worded.
 */

export type Granularity = "day" | "week";

export const RANGES = ["7d", "30d", "90d"] as const;
export type RangeKey = (typeof RANGES)[number];

export const DEFAULT_RANGE: RangeKey = "30d";

const DAY_MS = 86_400_000;

const RANGE_DAYS: Record<RangeKey, number> = { "7d": 7, "30d": 30, "90d": 90 };

export const RANGE_LABEL: Record<RangeKey, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
};

/** Anything unrecognised falls back to the default rather than erroring. */
export function parseRange(value: string | null | undefined): RangeKey {
  return RANGES.includes(value as RangeKey) ? (value as RangeKey) : DEFAULT_RANGE;
}

/**
 * Daily buckets stay readable up to a month; a quarter of them would be 90
 * unlabelled slivers, so 90d switches to weeks.
 */
export function granularityFor(range: RangeKey): Granularity {
  return range === "90d" ? "week" : "day";
}

/**
 * The window a range covers: N whole UTC days, the last of which is the day
 * containing `now`.
 *
 * Aligned to day boundaries rather than being a rolling N×24h window, because a
 * rolling window starts and ends mid-day and so touches N+1 calendar days. That
 * would put a half-height bar at each end of every chart and make "7 days" show
 * eight columns. The end is exclusive: it is the start of tomorrow.
 */
export function resolveRange(range: RangeKey, now: Date) {
  const startOfToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  return {
    start: new Date(startOfToday - (RANGE_DAYS[range] - 1) * DAY_MS),
    end: new Date(startOfToday + DAY_MS),
    granularity: granularityFor(range),
  };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/** The em dash Beam uses wherever a metric has nothing to report. */
export const NO_DATA = "—";

/**
 * A duration at roughly two significant figures: long enough to be useful,
 * short enough for a metric block. Deliberately coarse — nobody makes a
 * decision on the difference between 3.2 and 3.4 days.
 */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return NO_DATA;
  if (seconds < 60) return "< 1m";

  const minutes = seconds / 60;
  if (minutes < 60) return `${Math.round(minutes)}m`;

  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;

  const days = hours / 24;
  if (days < 10) return `${trim(days)}d`;
  if (days < 70) return `${Math.round(days)}d`;

  return `${trim(days / 7)}w`;
}

/** One decimal place, but only when it says something: 2.5 stays, 3.0 becomes 3. */
function trim(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? NO_DATA : `${value}%`;
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined
    ? NO_DATA
    : value.toLocaleString();
}

/* -------------------------------------------------------------------------- */
/* Comparison                                                                 */
/* -------------------------------------------------------------------------- */

export type Comparison = {
  delta: number;
  /** Whether more is better, so the UI can colour it. */
  direction: "up" | "down" | "flat";
  label: string;
};

/**
 * "+3 vs previous". Returns null when there is no previous value to compare
 * against, so callers render nothing rather than a misleading "+0".
 */
export function compareTo(
  current: number,
  previous: number | null | undefined,
  noun = "previous",
): Comparison | null {
  if (previous === null || previous === undefined) return null;

  const delta = current - previous;
  if (delta === 0) {
    return { delta: 0, direction: "flat", label: `no change vs ${noun}` };
  }
  return {
    delta,
    direction: delta > 0 ? "up" : "down",
    label: `${delta > 0 ? "+" : "−"}${Math.abs(delta)} vs ${noun}`,
  };
}

/** Short axis label for a bucket start, e.g. "12 Mar". */
export function formatBucket(date: string, granularity: Granularity): string {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return date;

  const label = parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  return granularity === "week" ? `w/c ${label}` : label;
}

/* -------------------------------------------------------------------------- */
/* Cycle scope                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How much of the original commitment landed, as completed over committed.
 *
 * The denominator is the scope the cycle opened with and never moves, so this
 * can read 15/20 while the cycle currently holds twenty-two issues.
 */
export function formatCommitted(completed: number, committed: number): string {
  return committed === 0 ? NO_DATA : `${completed}/${committed}`;
}

/**
 * Scope churn as two figures, never a net one.
 *
 * Four issues in and two out is a very different cycle from two quiet
 * additions, and a single net number hides that. Returns null when scope never
 * moved, so the UI shows nothing rather than a row of zeroes.
 */
export function formatScopeChange(
  added: number,
  removed: number,
): string | null {
  if (added === 0 && removed === 0) return null;
  const parts: string[] = [];
  if (added > 0) parts.push(`+${added}`);
  if (removed > 0) parts.push(`\u2212${removed}`);
  return parts.join(" ");
}

/** Why scope figures are missing, phrased for a tooltip. */
export const SCOPE_UNAVAILABLE =
  "This cycle started before Beam began recording cycle membership, so its committed scope cannot be known.";
