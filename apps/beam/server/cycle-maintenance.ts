/**
 * Cycles keep themselves tidy on read: every cycle read for a team calls
 * `syncTeamCycles`, which is cheap, idempotent and safe to run concurrently.
 * There is no cron — the starter has no reliable scheduler, and a team's
 * cycles only matter when somebody (or an agent) looks at them.
 *
 * Three steps, in this order:
 *   1. refresh the cached `cycles.status` column from the dates
 *   2. create upcoming cycles so a rollover always has a destination
 *   3. roll unfinished issues out of a cycle that has just ended
 *
 * Rollover idempotency comes from the status transition, not from a flag: work
 * only moves at the moment a cycle's stored status changes from `active` to
 * `completed`. Once that write lands the cycle is completed forever, so a
 * second call — or ten concurrent calls — move nothing more.
 */
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";

import { cycles, issues, teams, workflowStatuses } from "../drizzle/schema";
import { addWeeks, alignToWeekday, cycleState } from "../app/lib/cycle";

import { db } from "./db";
import { recordRollover } from "./issue-cycle-membership";

const UPCOMING_TARGET = 2;

type TeamSettings = typeof teams.$inferSelect;
type CycleRow = typeof cycles.$inferSelect;

async function createUpcomingCycles(
  team: TeamSettings,
  existing: CycleRow[],
  now: number,
): Promise<CycleRow[]> {
  const upcoming = existing.filter(
    (cycle) => cycleState(cycle, now) === "upcoming",
  );
  const missing = UPCOMING_TARGET - upcoming.length;
  if (missing <= 0) return existing;

  const weeks = Math.max(1, team.cycleDurationWeeks);
  const last = existing[existing.length - 1];
  let nextNumber = (last?.number ?? 0) + 1;
  let start = last
    ? new Date(last.endsAt)
    : alignToWeekday(new Date(now), team.cycleStartDay);

  const created: CycleRow[] = [];
  for (let index = 0; index < missing; index += 1) {
    const endsAt = addWeeks(start, weeks);
    // Unique (team_id, number) makes a concurrent duplicate a no-op instead of
    // an error, which is what keeps this safe to call from every read.
    const [row] = await db
      .insert(cycles)
      .values({
        teamId: team.id,
        number: nextNumber,
        startsAt: start,
        endsAt,
        status: "upcoming",
      })
      .onConflictDoNothing()
      .returning();
    if (row) created.push(row);
    start = endsAt;
    nextNumber += 1;
  }

  if (created.length === 0) return existing;
  return [...existing, ...created].sort((a, b) => a.number - b.number);
}

/**
 * Moves everything that is neither completed nor canceled into `destination`.
 * One bulk UPDATE, and deliberately no per-issue activity rows: a rollover is
 * a single system event, not forty people changing forty issues.
 */
async function rollIssuesForward(
  teamId: string,
  fromCycleId: string,
  destinationId: string,
): Promise<number> {
  const unfinished = await db
    .select({ id: issues.id })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .where(
      and(
        eq(issues.cycleId, fromCycleId),
        isNull(issues.deletedAt),
        ne(workflowStatuses.category, "completed"),
        ne(workflowStatuses.category, "canceled"),
      ),
    );

  if (unfinished.length === 0) return 0;

  const ids = unfinished.map((issue) => issue.id);
  const at = new Date();

  await db
    .update(issues)
    .set({ cycleId: destinationId, updatedAt: at })
    .where(inArray(issues.id, ids));

  // Finished issues are left alone, so their memberships in the old cycle
  // stay open: they are still assigned there, and a cycle ending is not a
  // removal. Only the work that actually moved gets a rollover pair.
  await recordRollover({
    issueIds: ids,
    teamId,
    fromCycleId,
    toCycleId: destinationId,
    at,
  });

  return ids.length;
}

export type CycleSync = { cycles: CycleRow[]; rolledOver: number };

/**
 * `now` exists so tests can place a team at a chosen point in its cycle
 * calendar instead of waiting for one to end. Production callers pass nothing.
 */
export async function syncTeamCycles(
  teamId: string,
  now: Date = new Date(),
): Promise<CycleSync> {
  const [team] = await db
    .select()
    .from(teams)
    .where(eq(teams.id, teamId))
    .limit(1);
  if (!team) return { cycles: [], rolledOver: 0 };

  let rows = await db
    .select()
    .from(cycles)
    .where(eq(cycles.teamId, teamId))
    .orderBy(asc(cycles.number));

  if (!team.cyclesEnabled) return { cycles: rows, rolledOver: 0 };

  const at = now.getTime();

  if (team.cycleAutoCreate) {
    rows = await createUpcomingCycles(team, rows, at);
  }

  let rolledOver = 0;

  for (const cycle of rows) {
    const state = cycleState(cycle, at);
    if (state === cycle.status) continue;

    // A cycle can jump straight from `upcoming` to `completed` if nobody
    // opened the app while it ran, so the trigger is "first time we record it
    // as completed", not "was active a moment ago".
    const justEnded = state === "completed";

    // Claim the transition first. If another request got here first this
    // update matches no row, so the rollover below never runs twice.
    const claimed = await db
      .update(cycles)
      .set({ status: state })
      .where(and(eq(cycles.id, cycle.id), eq(cycles.status, cycle.status)))
      .returning({ id: cycles.id });
    cycle.status = state;
    if (claimed.length === 0) continue;

    if (justEnded && team.cycleAutoRollover) {
      const destination = rows.find(
        (candidate) =>
          candidate.id !== cycle.id &&
          candidate.number > cycle.number &&
          cycleState(candidate, at) !== "completed",
      );
      if (destination) {
        rolledOver += await rollIssuesForward(
          team.id,
          cycle.id,
          destination.id,
        );
      }
    }
  }

  return { cycles: rows, rolledOver };
}
