/**
 * When a recurring rule fires, and how to say so in English.
 *
 * All of it is pure: given a schedule and an instant, `nextOccurrence` returns
 * the next instant, and nothing here reads a clock or a database. The processor
 * in `server/recurring-issues.ts` supplies `now`, which is what makes the whole
 * thing testable against fixed dates.
 *
 * TIME ZONES, WITHOUT A LIBRARY
 *
 * Beam has no date dependency — cycle maths is native `Date` — so rather than
 * add one for this, the two conversions a scheduler actually needs are built on
 * `Intl.DateTimeFormat`, which ships with the IANA database:
 *
 *   instant  -> local wall-clock fields   (`zonedParts`)
 *   wall-clock fields -> instant          (`instantFromZoned`)
 *
 * That is enough, and it stays correct as the tz database is updated.
 *
 * DST
 *
 * A schedule stores a wall-clock time, never an offset, and every occurrence is
 * recomputed from wall-clock fields. So "every weekday at 9:00 AM" is 9:00 AM
 * before a DST change and 9:00 AM after it; the UTC instant moves by an hour,
 * which is the point. Two days a year are ambiguous and are resolved by policy:
 *
 *   Spring forward — 2:30 AM does not exist on that date. The occurrence lands
 *   at the first real instant after the gap, so a 2:30 AM rule fires at 3:00 AM
 *   rather than being skipped for the day.
 *
 *   Fall back — 1:30 AM happens twice. The occurrence takes the FIRST of the
 *   two, so the rule fires once and earlier rather than later.
 *
 * Both are covered by tests.
 */

export const CADENCES = ["daily", "weekly", "monthly"] as const;
export type Cadence = (typeof CADENCES)[number];

/** Sunday is 0, matching `Date.prototype.getUTCDay`. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Schedule = {
  cadence: Cadence;
  /** Every N days / weeks / months. At least 1. */
  interval: number;
  /** Weekly only. Which days of the week to fire on. */
  weekdays?: number[] | null;
  /** Monthly only. Clamped to the length of short months. */
  dayOfMonth?: number | null;
  /** Wall-clock time in `timeZone`, as "HH:MM". */
  timeOfDay: string;
  /** IANA zone id, e.g. "America/Los_Angeles". */
  timeZone: string;
  startsAt: Date;
  endsAt?: Date | null;
};

export type WallClock = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
};

/* -------------------------------------------------------------------------- */
/* Time zone plumbing                                                         */
/* -------------------------------------------------------------------------- */

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "short",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

/** True when the runtime recognises the zone, so bad input fails early. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

const WEEKDAY_INDEX: Record<string, Weekday> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/** What a clock in `timeZone` reads at `instant`. */
export function zonedParts(
  instant: Date,
  timeZone: string,
): WallClock & { weekday: Weekday; second: number } {
  const parts = formatterFor(timeZone).formatToParts(instant);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "0";

  return {
    year: Number(value("year")),
    // `hour: "2-digit"` with hour12:false yields 24 for midnight in some
    // runtimes; normalising here keeps the arithmetic below honest.
    month: Number(value("month")),
    day: Number(value("day")),
    hour: Number(value("hour")) % 24,
    minute: Number(value("minute")),
    second: Number(value("second")),
    weekday: WEEKDAY_INDEX[value("weekday")] ?? 0,
  };
}

/** Milliseconds `timeZone` is ahead of UTC at `instant`. */
function offsetAt(instant: Date, timeZone: string): number {
  const local = zonedParts(instant, timeZone);
  const asIfUtc = Date.UTC(
    local.year,
    local.month - 1,
    local.day,
    local.hour,
    local.minute,
    local.second,
  );
  // Second precision is all `formatToParts` gives, so the sub-second remainder
  // is added back to keep the offset a whole number of minutes.
  return asIfUtc - (instant.getTime() - instant.getMilliseconds());
}

/**
 * The instant at which clocks in `timeZone` read `wall`.
 *
 * Two passes: the first guesses using the offset at the UTC-interpreted time,
 * the second corrects it using the offset actually in force near the answer.
 * That is what makes it right on the days either side of a DST change.
 */
export function instantFromZoned(wall: WallClock, timeZone: string): Date {
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    0,
  );

  const firstGuess = asUtc - offsetAt(new Date(asUtc), timeZone);
  const corrected = asUtc - offsetAt(new Date(firstGuess), timeZone);

  // In a spring-forward gap the requested wall time never occurs, and the two
  // passes disagree. Taking the later of them lands on the first instant after
  // the gap rather than an hour before it.
  const candidate = new Date(Math.max(firstGuess, corrected));

  // Confirm: if the clock does not actually read `wall` there, we are in the
  // gap, so advance to where the jump lands.
  const check = zonedParts(candidate, timeZone);
  if (check.hour !== wall.hour || check.minute !== wall.minute) {
    return new Date(Math.max(firstGuess, corrected));
  }
  return candidate;
}

/* -------------------------------------------------------------------------- */
/* Calendar helpers                                                           */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** A local calendar date as a UTC-midnight instant, for day arithmetic only. */
function dateKey(wall: { year: number; month: number; day: number }): number {
  return Date.UTC(wall.year, wall.month - 1, wall.day);
}

function addDaysToKey(key: number, days: number): number {
  return key + days * DAY_MS;
}

function partsFromKey(key: number) {
  const date = new Date(key);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    weekday: date.getUTCDay() as Weekday,
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Whole days between two local calendar dates. */
function daysBetween(fromKey: number, toKey: number): number {
  return Math.round((toKey - fromKey) / DAY_MS);
}

/** Monday-start week index, so "every 2 weeks" counts calendar weeks. */
function weekIndex(key: number): number {
  const weekday = new Date(key).getUTCDay();
  const monday = key - ((weekday + 6) % 7) * DAY_MS;
  return Math.round(monday / (7 * DAY_MS));
}

function parseTimeOfDay(timeOfDay: string): { hour: number; minute: number } {
  const [rawHour, rawMinute] = timeOfDay.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  return {
    hour: Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 9,
    minute: Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0,
  };
}

/** Weekly rules with no weekday selected fall back to the start date's day. */
function effectiveWeekdays(schedule: Schedule, startKey: number): number[] {
  const chosen = (schedule.weekdays ?? []).filter(
    (day) => Number.isInteger(day) && day >= 0 && day <= 6,
  );
  return chosen.length > 0
    ? [...new Set(chosen)].sort((a, b) => a - b)
    : [partsFromKey(startKey).weekday];
}

/* -------------------------------------------------------------------------- */
/* Occurrence maths                                                           */
/* -------------------------------------------------------------------------- */

/**
 * How many local dates to examine before giving up. Generous enough for
 * "every 12 months on the 31st" and still bounded, so a nonsensical schedule
 * returns null rather than spinning.
 */
function scanLimit(schedule: Schedule): number {
  const interval = Math.max(1, schedule.interval);
  if (schedule.cadence === "daily") return interval + 2;
  if (schedule.cadence === "weekly") return 7 * interval + 8;
  return 31 * interval + 40;
}

/**
 * The first occurrence strictly after `after`.
 *
 * Strictly, so feeding the previous occurrence back in always moves forward and
 * a processor cannot re-fire the same slot. Returns null when the schedule has
 * ended, or when nothing matches within the scan window.
 */
export function nextOccurrence(schedule: Schedule, after: Date): Date | null {
  const interval = Math.max(1, Math.floor(schedule.interval || 1));
  const { hour, minute } = parseTimeOfDay(schedule.timeOfDay);

  const startKey = dateKey(zonedParts(schedule.startsAt, schedule.timeZone));

  // Never look earlier than the schedule's own start.
  const floor =
    after.getTime() > schedule.startsAt.getTime() ? after : schedule.startsAt;
  const floorKey = dateKey(zonedParts(floor, schedule.timeZone));

  const weekdays =
    schedule.cadence === "weekly"
      ? effectiveWeekdays(schedule, startKey)
      : [];
  const limit = scanLimit({ ...schedule, interval });

  let key = Math.max(floorKey, startKey);

  for (let step = 0; step <= limit; step += 1, key = addDaysToKey(key, 1)) {
    const parts = partsFromKey(key);

    if (!matches(schedule.cadence, {
      parts,
      key,
      startKey,
      interval,
      weekdays,
      dayOfMonth: schedule.dayOfMonth ?? null,
    })) {
      continue;
    }

    const candidate = instantFromZoned(
      { ...parts, hour, minute },
      schedule.timeZone,
    );

    if (candidate.getTime() <= floor.getTime()) continue;
    if (candidate.getTime() < schedule.startsAt.getTime()) continue;
    if (schedule.endsAt && candidate.getTime() > schedule.endsAt.getTime()) {
      return null;
    }
    return candidate;
  }

  return null;
}

function matches(
  cadence: Cadence,
  input: {
    parts: ReturnType<typeof partsFromKey>;
    key: number;
    startKey: number;
    interval: number;
    weekdays: number[];
    dayOfMonth: number | null;
  },
): boolean {
  const { parts, key, startKey, interval, weekdays, dayOfMonth } = input;

  if (cadence === "daily") {
    const elapsed = daysBetween(startKey, key);
    return elapsed >= 0 && elapsed % interval === 0;
  }

  if (cadence === "weekly") {
    if (!weekdays.includes(parts.weekday)) return false;
    const elapsed = weekIndex(key) - weekIndex(startKey);
    return elapsed >= 0 && elapsed % interval === 0;
  }

  // Monthly. A rule for the 31st fires on the 30th of a 30-day month and on
  // the 28th of February rather than skipping those months entirely.
  const startParts = partsFromKey(startKey);
  const wanted = dayOfMonth ?? startParts.day;
  const target = Math.min(wanted, daysInMonth(parts.year, parts.month));
  if (parts.day !== target) return false;

  const elapsed =
    (parts.year - startParts.year) * 12 + (parts.month - startParts.month);
  return elapsed >= 0 && elapsed % interval === 0;
}

/* -------------------------------------------------------------------------- */
/* Human-readable summary                                                     */
/* -------------------------------------------------------------------------- */

const WEEKDAY_NAME = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const WEEKDAYS_MON_TO_FRI = [1, 2, 3, 4, 5];

/** "9:00 AM" from "09:00". */
export function formatTimeOfDay(timeOfDay: string): string {
  const { hour, minute } = parseTimeOfDay(timeOfDay);
  const suffix = hour < 12 ? "AM" : "PM";
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function ordinal(value: number): string {
  const rest = value % 100;
  if (rest >= 11 && rest <= 13) return `${value}th`;
  const suffix = ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${value % 10 <= 3 ? suffix : "th"}`;
}

function listOf(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * "Every 2 weeks on Friday at 3:00 PM".
 *
 * One implementation, used by the list, the editor and anywhere else a schedule
 * is shown, so the wording cannot drift between them.
 */
export function describeSchedule(
  schedule: Pick<
    Schedule,
    "cadence" | "interval" | "weekdays" | "dayOfMonth" | "timeOfDay"
  >,
): string {
  const interval = Math.max(1, Math.floor(schedule.interval || 1));
  const at = `at ${formatTimeOfDay(schedule.timeOfDay)}`;

  if (schedule.cadence === "daily") {
    return interval === 1
      ? `Every day ${at}`
      : `Every ${interval} days ${at}`;
  }

  if (schedule.cadence === "weekly") {
    const days = [...new Set(schedule.weekdays ?? [])].sort((a, b) => a - b);

    if (
      interval === 1 &&
      days.length === 5 &&
      WEEKDAYS_MON_TO_FRI.every((day) => days.includes(day))
    ) {
      return `Every weekday ${at}`;
    }

    const names = days.map((day) => WEEKDAY_NAME[day] ?? "").filter(Boolean);
    const on = names.length > 0 ? `on ${listOf(names)} ` : "";
    return interval === 1
      ? `Every ${names.length === 1 ? names[0] : `week ${on}`.trim()} ${at}`.replace(
          /\s+/g,
          " ",
        )
      : `Every ${interval} weeks ${on}${at}`;
  }

  const day = schedule.dayOfMonth ?? 1;
  const on = `on the ${ordinal(day)}`;
  return interval === 1
    ? `Monthly ${on} ${at}`
    : `Every ${interval} months ${on} ${at}`;
}
