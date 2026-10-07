/**
 * Planning metrics derived from cycle membership history.
 *
 * `cycle-progress.ts` answers "how much of what is in this cycle right now is
 * done". This file answers the harder question: what did the team actually
 * commit to when the cycle started, and what happened to that commitment.
 * Those differ the moment anyone adds, removes or rolls over work, which is
 * why `issue_cycle_memberships` exists.
 *
 * DEFINITIONS, decided once here.
 *
 * Committed: the issue's membership interval covered the cycle's start
 * instant. Work added on day three was never committed to, and work moved out
 * on day four still was.
 *
 * Committed completed: a committed issue whose `completed_at` is at or before
 * the cycle's end. For a running cycle that reads as "so far".
 *
 * The committed denominator is FIXED. An issue that was committed and then
 * pushed to the next cycle still counts against the commitment, uncompleted.
 * Otherwise a team could improve its numbers by moving unfinished work out on
 * the last day, which is exactly the behaviour this metric exists to catch.
 *
 * Scope added: memberships opened after the cycle started and before it ended.
 * This includes carried-in work, which is also reported separately so the two
 * can be told apart.
 *
 * Scope removed: memberships closed inside the cycle window. Finishing an
 * issue is not a removal — membership tracks assignment, not progress.
 *
 * Carried in / out: memberships opened or closed with a `rollover` reason.
 *
 * Estimates are summed over whatever committed issues carry one. Missing
 * estimates are never imputed as zero, and the estimate figures are omitted
 * entirely when nothing in the commitment was estimated.
 *
 * AVAILABILITY. Membership history only exists from `teams.cycle_history_
 * started_at` onwards. For a cycle that started earlier the intervals are
 * incomplete, so every figure here is unavailable rather than zero.
 */

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import {
  cycles,
  issueCycleMemberships,
  issues,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

import { db } from "./db";

export type CycleScope = {
  committed: number;
  committedCompleted: number;
  /** Percent of the original commitment completed, null when nothing was. */
  committedPercent: number | null;
  added: number;
  removed: number;
  carriedIn: number;
  carriedOut: number;
  /** Null when no committed issue carried an estimate. */
  estimate: { committed: number; completed: number } | null;
};

/**
 * Scope history for several cycles at once.
 *
 * A cycle is absent from the map when its history predates collection, which
 * callers must render as "unavailable" rather than as zeros.
 */
export async function cycleScope(
  cycleIds: string[],
): Promise<Map<string, CycleScope>> {
  const result = new Map<string, CycleScope>();
  if (cycleIds.length === 0) return result;

  const eligible = await db
    .select({ id: cycles.id })
    .from(cycles)
    .innerJoin(teams, eq(teams.id, cycles.teamId))
    .where(
      and(
        inArray(cycles.id, cycleIds),
        sql`${cycles.startsAt} >= ${teams.cycleHistoryStartedAt}`,
      ),
    );

  const ids = eligible.map((row) => row.id);
  if (ids.length === 0) return result;

  // Active across the cycle's first instant: joined at or before it, and not
  // yet gone by then.
  const committed = sql`(${issueCycleMemberships.addedAt} <= ${cycles.startsAt} and (${issueCycleMemberships.removedAt} is null or ${issueCycleMemberships.removedAt} > ${cycles.startsAt}))`;
  const done = sql`(${issues.completedAt} is not null and ${issues.completedAt} <= ${cycles.endsAt})`;

  const committedFilter = sql`filter (where ${committed})`;
  const completedFilter = sql`filter (where ${committed} and ${done})`;

  const rows = await db
    .select({
      cycleId: issueCycleMemberships.cycleId,
      committed: sql<number>`(count(*) ${committedFilter})::int`,
      committedCompleted: sql<number>`(count(*) ${completedFilter})::int`,
      estimateCommitted: sql<number>`coalesce(sum(${issues.estimate}) ${committedFilter}, 0)::int`,
      estimateCompleted: sql<number>`coalesce(sum(${issues.estimate}) ${completedFilter}, 0)::int`,
      estimated: sql<number>`(count(${issues.estimate}) ${committedFilter})::int`,
      added: sql<number>`(count(*) filter (where ${issueCycleMemberships.addedAt} > ${cycles.startsAt} and ${issueCycleMemberships.addedAt} <= ${cycles.endsAt}))::int`,
      removed: sql<number>`(count(*) filter (where ${issueCycleMemberships.removedAt} > ${cycles.startsAt} and ${issueCycleMemberships.removedAt} <= ${cycles.endsAt}))::int`,
      carriedIn: sql<number>`(count(*) filter (where ${issueCycleMemberships.addReason} = 'rollover'))::int`,
      carriedOut: sql<number>`(count(*) filter (where ${issueCycleMemberships.removeReason} = 'rollover'))::int`,
    })
    .from(issueCycleMemberships)
    .innerJoin(cycles, eq(cycles.id, issueCycleMemberships.cycleId))
    .innerJoin(issues, eq(issues.id, issueCycleMemberships.issueId))
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, issues.statusId))
    .where(
      and(
        inArray(issueCycleMemberships.cycleId, ids),
        // Matches cycle progress: deleted, archived and canceled work is not
        // part of what a team is judged on.
        isNull(issues.deletedAt),
        isNull(issues.archivedAt),
        ne(workflowStatuses.category, "canceled"),
      ),
    )
    .groupBy(issueCycleMemberships.cycleId);

  const byCycle = new Map(rows.map((row) => [row.cycleId, row]));

  // Every eligible cycle gets an entry, including ones with no membership rows
  // at all: an empty cycle genuinely committed to nothing, which is a fact
  // rather than a gap in the record.
  for (const id of ids) {
    const row = byCycle.get(id);
    result.set(id, {
      committed: row?.committed ?? 0,
      committedCompleted: row?.committedCompleted ?? 0,
      committedPercent:
        row && row.committed > 0
          ? Math.round((row.committedCompleted / row.committed) * 100)
          : null,
      added: row?.added ?? 0,
      removed: row?.removed ?? 0,
      carriedIn: row?.carriedIn ?? 0,
      carriedOut: row?.carriedOut ?? 0,
      estimate:
        row && row.estimated > 0
          ? { committed: row.estimateCommitted, completed: row.estimateCompleted }
          : null,
    });
  }

  return result;
}
