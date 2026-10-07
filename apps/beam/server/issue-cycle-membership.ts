/**
 * The one place that writes cycle membership history.
 *
 * `issues.cycle_id` remains the authoritative current assignment; this module
 * keeps `issue_cycle_memberships` in step with it so analytics can reconstruct
 * what a cycle actually held at any past instant.
 *
 * Semantics, in one sentence: a membership row says the issue was assigned to
 * that cycle from `addedAt` until `removedAt`. Assignment, nothing else —
 * finishing an issue does not close its membership, and neither does the cycle
 * ending. Only a change to `issues.cycle_id` does.
 *
 * Every cycle write path calls in here. Nothing else inserts into the table.
 * Analytics reads it but never writes it.
 */

import { and, eq, inArray, isNull } from "drizzle-orm";

import { issueCycleMemberships } from "../drizzle/schema";

import { db } from "./db";

export type AddReason =
  | "manual"
  | "bulk"
  | "created_in_cycle"
  | "recurring"
  | "rollover"
  | "system";

export type RemoveReason =
  | "manual"
  | "bulk"
  | "rollover"
  | "cycle_changed"
  | "issue_deleted"
  | "system";

/** The membership an issue is living in right now, if any. */
export async function activeMembership(issueId: string) {
  const [row] = await db
    .select()
    .from(issueCycleMemberships)
    .where(
      and(
        eq(issueCycleMemberships.issueId, issueId),
        isNull(issueCycleMemberships.removedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Records that an issue has just moved from whatever cycle it was in to
 * `toCycleId` (or to no cycle when that is null).
 *
 * Caller has already validated the cycle and written `issues.cycle_id`; this
 * only mirrors the decision into history. Moving an issue to the cycle it is
 * already in writes nothing, so repeated no-op saves cannot pile up rows.
 */
export async function recordCycleChange({
  issueId,
  teamId,
  toCycleId,
  actorId = null,
  addReason = "manual",
  removeReason = "cycle_changed",
  at = new Date(),
}: {
  issueId: string;
  teamId: string;
  toCycleId: string | null;
  actorId?: string | null;
  addReason?: AddReason;
  removeReason?: RemoveReason;
  at?: Date;
}): Promise<void> {
  const open = await activeMembership(issueId);
  if (open?.cycleId === toCycleId) return;

  if (open) {
    await db
      .update(issueCycleMemberships)
      .set({ removedAt: at, removedBy: actorId, removeReason })
      .where(eq(issueCycleMemberships.id, open.id));
  }

  if (toCycleId) {
    await openMembership({
      issueId,
      teamId,
      cycleId: toCycleId,
      actorId,
      reason: addReason,
      at,
    });
  }
}

/**
 * Opens a membership for an issue known to have none — the create-issue path.
 *
 * `onConflictDoNothing` leans on the partial unique index so a racing writer
 * cannot leave an issue with two open memberships.
 */
export async function openMembership({
  issueId,
  teamId,
  cycleId,
  actorId = null,
  reason = "manual",
  at = new Date(),
}: {
  issueId: string;
  teamId: string;
  cycleId: string;
  actorId?: string | null;
  reason?: AddReason;
  at?: Date;
}): Promise<void> {
  await db
    .insert(issueCycleMemberships)
    .values({
      issueId,
      cycleId,
      teamId,
      addedAt: at,
      addedBy: actorId,
      addReason: reason,
    })
    .onConflictDoNothing();
}

/**
 * The rollover case: many issues leaving one cycle for another at the same
 * instant, as a single system event.
 *
 * Two statements rather than a loop, because a rollover can touch every open
 * issue on a team and the caller is already inside a maintenance pass that
 * users are waiting on.
 */
export async function recordRollover({
  issueIds,
  teamId,
  fromCycleId,
  toCycleId,
  at = new Date(),
}: {
  issueIds: string[];
  teamId: string;
  fromCycleId: string;
  toCycleId: string;
  at?: Date;
}): Promise<void> {
  if (issueIds.length === 0) return;

  await db
    .update(issueCycleMemberships)
    .set({ removedAt: at, removeReason: "rollover" })
    .where(
      and(
        eq(issueCycleMemberships.cycleId, fromCycleId),
        isNull(issueCycleMemberships.removedAt),
        inArray(issueCycleMemberships.issueId, issueIds),
      ),
    );

  await db
    .insert(issueCycleMemberships)
    .values(
      issueIds.map((issueId) => ({
        issueId,
        cycleId: toCycleId,
        teamId,
        addedAt: at,
        addReason: "rollover" as const,
      })),
    )
    .onConflictDoNothing();
}
