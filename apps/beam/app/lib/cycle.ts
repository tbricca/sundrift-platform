/**
 * One definition of what a cycle *is*, shared by the server and the UI so the
 * two can never disagree about which cycle is current.
 *
 * Dates are the source of truth; `cycles.status` is a cache of the same answer
 * that write paths keep in step. Reading code should always call
 * `cycleState()` rather than trusting the stored column.
 */
export type CycleStatus = "upcoming" | "active" | "completed";

export type CycleDates = { startsAt: string | Date; endsAt: string | Date };

export const CYCLE_STATE_LABEL: Record<CycleStatus, string> = {
  active: "Current",
  upcoming: "Upcoming",
  completed: "Previous",
};

const DAY_MS = 86_400_000;

function time(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

export function cycleState(cycle: CycleDates, now = Date.now()): CycleStatus {
  if (now < time(cycle.startsAt)) return "upcoming";
  if (now >= time(cycle.endsAt)) return "completed";
  return "active";
}

/** How far through an active cycle we are, 0–100. */
export function cycleElapsedPercent(
  cycle: CycleDates,
  now = Date.now(),
): number {
  const start = time(cycle.startsAt);
  const span = time(cycle.endsAt) - start;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round(((now - start) / span) * 100)));
}

export function cycleDaysRemaining(
  cycle: CycleDates,
  now = Date.now(),
): number {
  return Math.max(0, Math.ceil((time(cycle.endsAt) - now) / DAY_MS));
}

export function cycleTitle(cycle: {
  number: number;
  name?: string | null;
}): string {
  return `Cycle ${cycle.number}`;
}

/**
 * Seeded cycles are often named "Cycle 12", which the number already says.
 * Only a name that adds information is worth rendering.
 */
export function cycleSubtitle(cycle: {
  number: number;
  name?: string | null;
}): string | null {
  const name = cycle.name?.trim();
  if (!name || name === cycleTitle(cycle)) return null;
  return name;
}

export function formatCycleRange(cycle: CycleDates): string {
  const start = new Date(cycle.startsAt);
  const end = new Date(cycle.endsAt);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const endText = end.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${startText} – ${endText}`;
}

/**
 * Cycle boundaries are whole days in UTC: a cycle starts at midnight on its
 * start weekday and ends the instant the next one begins, so no issue can fall
 * between two cycles.
 */
export function alignToWeekday(from: Date, weekday: number): Date {
  const start = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
  );
  const shift = (weekday - start.getUTCDay() + 7) % 7;
  start.setUTCDate(start.getUTCDate() + shift);
  return start;
}

export function addWeeks(from: Date, weeks: number): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + weeks * 7);
  return next;
}
