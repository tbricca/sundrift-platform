/**
 * Beam's analytics, computed entirely in SQL.
 *
 * Every number on an analytics surface comes from this file, so the rules below
 * are stated once and never re-decided in a loader or a component.
 *
 * WHICH ISSUES COUNT
 *
 * - Soft-deleted (`deleted_at`) issues are excluded everywhere. They are gone.
 * - Archived issues are INCLUDED. Archiving tidies a list; it does not rewrite
 *   what the team shipped last quarter.
 * - Issues still sitting in triage (`pending` or `snoozed`) are excluded from
 *   every delivery metric, including "created". They are unreviewed intake, not
 *   accepted work, and counting them would make intake spikes look like the
 *   team took on more. Once accepted or declined they count normally, dated by
 *   their own `created_at`. Triage volume is visible in Triage itself.
 * - Canceled issues count only as canceled. They never count as completed and
 *   never contribute to completion-time percentiles.
 *
 * WHICH DATE A METRIC USES
 *
 * Each metric is dated by the event it measures, not by a single shared column:
 * created uses `created_at`, completed uses `completed_at`, canceled uses
 * `canceled_at`. So one issue can be created outside the window and completed
 * inside it, and it correctly counts once, as a completion.
 *
 * `completed_at` and `canceled_at` are safe to trust: every status write in
 * Beam funnels through `update-issue`, which sets them from the target status
 * category and clears them on the way back out.
 *
 * COMPLETION RATE
 *
 * completed / (completed + canceled), counting resolutions that happened inside
 * the window.
 *
 * Read it as: "of the work this team finished with in this period, how much
 * shipped rather than being dropped." The denominator is deliberately not
 * "issues created in the window" — issues created late in a window have not had
 * time to finish, which drags the number down for reasons that have nothing to
 * do with delivery. Both sides of this ratio are events with timestamps in the
 * same window, so the figure means one thing.
 *
 * It is null, not zero, when nothing was resolved. Zero would read as "you
 * completed nothing", which is a different claim from "nothing finished yet".
 *
 * TIME ZONE
 *
 * All bucketing is UTC (`date_trunc` on `timestamptz` at UTC). Beam stores no
 * per-user or per-workspace time zone, so there is nothing better to use, and
 * inventing one would put issues in the wrong day near midnight.
 *
 * WHAT IS DELIBERATELY MISSING
 *
 * No carryover, no committed-vs-completed, no velocity. See `getCycleAnalytics`
 * for why the data model cannot support them honestly.
 */
import { and, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import { cycles, issues, members, workflowStatuses } from "../drizzle/schema";

import { cycleMetrics, type CycleMetrics } from "./cycle-progress";
import { cycleScope, type CycleScope } from "./cycle-scope";
import { db } from "./db";

export type Granularity = "day" | "week";

export type TrendBucket = {
  /** Bucket start, ISO date (UTC). */
  date: string;
  created: number;
  completed: number;
};

export type CompletionTime = {
  /** Median seconds from `created_at` to `completed_at`. */
  medianSeconds: number;
  p75Seconds: number;
  /** How many completions the percentiles were taken over. */
  sampleSize: number;
};

export type TeamAnalytics = {
  window: { start: string; end: string; granularity: Granularity };
  created: number;
  completed: number;
  canceled: number;
  /** Null when nothing was resolved in the window. */
  completionRate: number | null;
  /** Null when nothing completed in the window. */
  completionTime: CompletionTime | null;
  /** Null when no completed issue in the window carried an estimate. */
  completedEstimate: number | null;
  /** Completions split by who they were assigned to. Operational only. */
  completedBy: { human: number; agent: number; unassigned: number };
  trend: TrendBucket[];
};

export type CycleAnalyticsSummary = {
  id: string;
  number: number;
  name: string | null;
  metrics: CycleMetrics;
  completionTime: CompletionTime | null;
  /**
   * Planning figures derived from membership history. Null means the cycle
   * began before Beam started recording it, so the numbers are unknowable —
   * never render that as zero.
   */
  scope: CycleScope | null;
};

export type CycleAnalytics = {
  current: CycleAnalyticsSummary;
  /** The most recent finished cycle, when one exists.  */
  previous: CycleAnalyticsSummary | null;
};

export type ProjectAnalytics = {
  completed: number;
  total: number;
  canceled: number;
  completionTime: CompletionTime | null;
  completedEstimate: number | null;
  totalEstimate: number | null;
  /** Completions in the trailing window, for a sense of current pace. */
  recentCompleted: number;
  recentDays: number;
  trend: TrendBucket[];
  granularity: Granularity;
};

/* -------------------------------------------------------------------------- */
/* Shared predicates                                                          */
/* -------------------------------------------------------------------------- */

/**
 * The issues any delivery metric is allowed to see: not soft-deleted, and past
 * triage. Archived issues stay in.
 */
function inDeliveryScope(): SQL {
  return and(
    isNull(issues.deletedAt),
    or(
      isNull(issues.triageStatus),
      inArray(issues.triageStatus, ["accepted", "declined"]),
    ),
  )!;
}

const between = (column: PgColumn, start: Date, end: Date) =>
  and(gte(column, start), lt(column, end))!;

/**
 * Seconds between creation and completion, as a percentile over a filter.
 *
 * Ordering on the epoch rather than the interval keeps `percentile_cont` on its
 * `double precision` overload. Passing an interval leaves Postgres choosing
 * between two candidate functions for a bind parameter it cannot type, and it
 * refuses. The fraction is cast for the same reason.
 */
function percentile(fraction: number, filter: SQL) {
  return sql<number | null>`percentile_cont(${fraction}::double precision) within group (
    order by extract(epoch from (${issues.completedAt} - ${issues.createdAt}))
  ) filter (where ${measurable(filter)})`;
}

/**
 * A completion whose duration means something.
 *
 * An issue whose `completed_at` precedes its `created_at` has had its dates
 * rewritten by an import or a seed, and a negative duration would drag a median
 * below zero — a figure that cannot be true and that a reader has no way to
 * challenge. Such rows still count as completions; they are only left out of
 * the duration statistic, and `sampleSize` reports how many were measured.
 */
function measurable(filter: SQL): SQL {
  return and(filter, sql`${issues.completedAt} >= ${issues.createdAt}`)!;
}

function completionTimeOf(
  medianSeconds: number | null,
  p75Seconds: number | null,
  sampleSize: number,
): CompletionTime | null {
  if (sampleSize === 0 || medianSeconds === null) return null;
  return {
    medianSeconds: Math.round(medianSeconds),
    p75Seconds: Math.round(p75Seconds ?? medianSeconds),
    sampleSize,
  };
}

/** Null rather than zero, so "no estimates recorded" is distinguishable. */
function estimateOf(total: number, estimated: number): number | null {
  return estimated > 0 ? total : null;
}

function rateOf(completed: number, canceled: number): number | null {
  const resolved = completed + canceled;
  return resolved === 0 ? null : Math.round((completed / resolved) * 100);
}

/* -------------------------------------------------------------------------- */
/* Trend buckets                                                              */
/* -------------------------------------------------------------------------- */

const DAY_MS = 86_400_000;

/** UTC bucket start for a timestamp, matching what `date_trunc` produces. */
function bucketStart(date: Date, granularity: Granularity): Date {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  if (granularity === "week") {
    // date_trunc('week') is ISO: weeks start on Monday.
    const weekday = (start.getUTCDay() + 6) % 7;
    start.setUTCDate(start.getUTCDate() - weekday);
  }
  return start;
}

function bucketKeys(start: Date, end: Date, granularity: Granularity) {
  const keys: string[] = [];
  const step = granularity === "week" ? 7 * DAY_MS : DAY_MS;
  for (
    let at = bucketStart(start, granularity).getTime();
    at < end.getTime();
    at += step
  ) {
    keys.push(new Date(at).toISOString().slice(0, 10));
  }
  return keys;
}

/**
 * Counts grouped by bucket. Two small grouped queries rather than one, because
 * an issue created in one bucket and completed in another has to land in both,
 * which a single `GROUP BY` cannot express.
 */
async function trendFor(
  scope: SQL,
  start: Date,
  end: Date,
  granularity: Granularity,
): Promise<TrendBucket[]> {
  // `date_trunc` needs its unit as a literal, not a bind parameter: Postgres
  // cannot type `date_trunc($1, ...)`. Resolved through a fixed map so nothing
  // caller-supplied ever reaches the statement.
  const unit = granularity === "week" ? sql.raw("'week'") : sql.raw("'day'");
  const bucket = (column: PgColumn) =>
    sql<string>`to_char(date_trunc(${unit}, ${column} at time zone 'UTC'), 'YYYY-MM-DD')`;

  const [createdRows, completedRows] = await Promise.all([
    db
      .select({
        bucket: bucket(issues.createdAt),
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(and(scope, between(issues.createdAt, start, end)))
      .groupBy(bucket(issues.createdAt)),
    db
      .select({
        bucket: bucket(issues.completedAt),
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(and(scope, between(issues.completedAt, start, end)))
      .groupBy(bucket(issues.completedAt)),
  ]);

  const created = new Map(createdRows.map((row) => [row.bucket, row.count]));
  const completed = new Map(
    completedRows.map((row) => [row.bucket, row.count]),
  );

  return bucketKeys(start, end, granularity).map((date) => ({
    date,
    created: created.get(date) ?? 0,
    completed: completed.get(date) ?? 0,
  }));
}

/* -------------------------------------------------------------------------- */
/* Team                                                                       */
/* -------------------------------------------------------------------------- */

export async function getTeamAnalytics({
  teamId,
  start,
  end,
  granularity,
}: {
  teamId: string;
  start: Date;
  end: Date;
  granularity: Granularity;
}): Promise<TeamAnalytics> {
  const scope = and(eq(issues.teamId, teamId), inDeliveryScope())!;

  const createdIn = between(issues.createdAt, start, end);
  const completedIn = between(issues.completedAt, start, end);
  const canceledIn = between(issues.canceledAt, start, end);
  const completedFilter = sql`filter (where ${completedIn})`;

  // One row: every headline number, including the assignee-kind split, which
  // rides along on a left join rather than costing a second round trip.
  const [totals] = await db
    .select({
      created: sql<number>`(count(*) filter (where ${createdIn}))::int`,
      completed: sql<number>`(count(*) ${completedFilter})::int`,
      canceled: sql<number>`(count(*) filter (where ${canceledIn}))::int`,
      estimateCompleted: sql<number>`coalesce(sum(${issues.estimate}) ${completedFilter}, 0)::int`,
      estimatedCount: sql<number>`(count(${issues.estimate}) ${completedFilter})::int`,
      measured: sql<number>`(count(*) filter (where ${measurable(completedIn)}))::int`,
      median: percentile(0.5, completedIn),
      p75: percentile(0.75, completedIn),
      byHuman: sql<number>`(count(*) filter (where ${completedIn} and ${members.kind} = 'human'))::int`,
      byAgent: sql<number>`(count(*) filter (where ${completedIn} and ${members.kind} = 'agent'))::int`,
      unassigned: sql<number>`(count(*) filter (where ${completedIn} and ${issues.assigneeId} is null))::int`,
    })
    .from(issues)
    .leftJoin(members, eq(issues.assigneeId, members.id))
    .where(and(scope, or(createdIn, completedIn, canceledIn)));

  const trend = await trendFor(scope, start, end, granularity);

  return {
    window: {
      start: start.toISOString(),
      end: end.toISOString(),
      granularity,
    },
    created: totals?.created ?? 0,
    completed: totals?.completed ?? 0,
    canceled: totals?.canceled ?? 0,
    completionRate: rateOf(totals?.completed ?? 0, totals?.canceled ?? 0),
    completionTime: completionTimeOf(
      totals?.median ?? null,
      totals?.p75 ?? null,
      totals?.measured ?? 0,
    ),
    completedEstimate: estimateOf(
      totals?.estimateCompleted ?? 0,
      totals?.estimatedCount ?? 0,
    ),
    completedBy: {
      human: totals?.byHuman ?? 0,
      agent: totals?.byAgent ?? 0,
      unassigned: totals?.unassigned ?? 0,
    },
    trend,
  };
}

/* -------------------------------------------------------------------------- */
/* Cycle                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Cycle analytics, and a deliberate omission.
 *
 * Beam stores only an issue's CURRENT `cycle_id`, and rollover moves unfinished
 * issues into the next cycle with one bulk UPDATE that writes no activity rows.
 * Nothing in the database records that an issue was ever in an earlier cycle.
 *
 * So three metrics people expect here cannot be computed honestly and are not
 * offered: committed/planned scope at cycle start, carryover into the next
 * cycle, and velocity derived from either. Once rollover has run, a finished
 * cycle's rows are exactly the issues that finished in it, which makes any
 * "planned vs completed" figure trivially 100% and completely meaningless.
 *
 * What is offered is what the rows can support: what a cycle currently holds,
 * how much of it is done, and how that compares with the previous cycle.
 * Fixing this properly means recording cycle membership changes at rollover
 * time; that would start collecting truthful data from that day forward and
 * cannot be backfilled.
 */
export async function getCycleAnalytics(
  cycleId: string,
): Promise<CycleAnalytics | null> {
  const [cycle] = await db
    .select()
    .from(cycles)
    .where(eq(cycles.id, cycleId))
    .limit(1);
  if (!cycle) return null;

  const [previous] = await db
    .select()
    .from(cycles)
    .where(
      and(
        eq(cycles.teamId, cycle.teamId),
        lt(cycles.number, cycle.number),
        eq(cycles.status, "completed"),
      ),
    )
    .orderBy(sql`${cycles.number} desc`)
    .limit(1);

  const ids = previous ? [cycle.id, previous.id] : [cycle.id];
  const [metrics, times, scope] = await Promise.all([
    cycleMetrics(ids),
    completionTimeByGroup(issues.cycleId, ids),
    cycleScope(ids),
  ]);

  const summarise = (row: typeof cycle): CycleAnalyticsSummary => ({
    id: row.id,
    number: row.number,
    name: row.name,
    metrics: metrics.get(row.id) ?? {
      completed: 0,
      total: 0,
      percent: null,
      estimate: null,
    },
    completionTime: times.get(row.id) ?? null,
    scope: scope.get(row.id) ?? null,
  });

  return {
    current: summarise(cycle),
    previous: previous ? summarise(previous) : null,
  };
}

/** Completion-time percentiles for several projects or cycles at once. */
async function completionTimeByGroup(
  groupColumn: typeof issues.cycleId,
  ids: string[],
): Promise<Map<string, CompletionTime | null>> {
  const result = new Map<string, CompletionTime | null>();
  if (ids.length === 0) return result;

  const completed = sql`${issues.completedAt} is not null`;

  const rows = await db
    .select({
      key: groupColumn,
      sampleSize: sql<number>`(count(*) filter (where ${measurable(completed as SQL)}))::int`,
      median: percentile(0.5, completed as SQL),
      p75: percentile(0.75, completed as SQL),
    })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .where(and(inArray(groupColumn, ids), inDeliveryScope()))
    .groupBy(groupColumn);

  for (const row of rows) {
    if (!row.key) continue;
    result.set(
      row.key,
      completionTimeOf(row.median, row.p75, row.sampleSize),
    );
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Project                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Project analytics cover the issues the project holds RIGHT NOW. Beam does not
 * record project reassignment history, so an issue moved between projects
 * counts wholly towards its current one; the trend is therefore "when the work
 * this project currently owns was completed", not a replay of the project as it
 * looked at the time.
 */
export async function getProjectAnalytics({
  projectId,
  now,
  recentDays = 30,
  granularity = "week",
}: {
  projectId: string;
  now: Date;
  recentDays?: number;
  granularity?: Granularity;
}): Promise<ProjectAnalytics> {
  const scope = and(eq(issues.projectId, projectId), inDeliveryScope())!;
  const recentStart = new Date(now.getTime() - recentDays * DAY_MS);

  const completed = sql`${workflowStatuses.category} = 'completed'`;
  const completedFilter = sql`filter (where ${completed})`;

  const [totals] = await db
    .select({
      total: sql<number>`(count(*) filter (where ${workflowStatuses.category} <> 'canceled'))::int`,
      completed: sql<number>`(count(*) ${completedFilter})::int`,
      canceled: sql<number>`(count(*) filter (where ${workflowStatuses.category} = 'canceled'))::int`,
      estimateTotal: sql<number>`coalesce(sum(${issues.estimate}) filter (where ${workflowStatuses.category} <> 'canceled'), 0)::int`,
      estimateCompleted: sql<number>`coalesce(sum(${issues.estimate}) ${completedFilter}, 0)::int`,
      estimatedCount: sql<number>`(count(${issues.estimate}))::int`,
      sampleSize: sql<number>`(count(*) filter (where ${measurable(sql`${issues.completedAt} is not null` as SQL)}))::int`,
      median: percentile(0.5, sql`${issues.completedAt} is not null` as SQL),
      p75: percentile(0.75, sql`${issues.completedAt} is not null` as SQL),
      recentCompleted: sql<number>`(count(*) filter (where ${issues.completedAt} >= ${recentStart}))::int`,
    })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .where(scope);

  const trend = await trendFor(scope, recentStart, now, granularity);

  return {
    total: totals?.total ?? 0,
    completed: totals?.completed ?? 0,
    canceled: totals?.canceled ?? 0,
    completionTime: completionTimeOf(
      totals?.median ?? null,
      totals?.p75 ?? null,
      totals?.sampleSize ?? 0,
    ),
    completedEstimate: estimateOf(
      totals?.estimateCompleted ?? 0,
      totals?.estimatedCount ?? 0,
    ),
    totalEstimate: estimateOf(
      totals?.estimateTotal ?? 0,
      totals?.estimatedCount ?? 0,
    ),
    recentCompleted: totals?.recentCompleted ?? 0,
    recentDays,
    trend,
    granularity,
  };
}
