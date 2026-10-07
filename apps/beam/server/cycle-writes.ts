import { and, desc, eq, ne } from "drizzle-orm";

import { cycles } from "../drizzle/schema";

import { db } from "./db";
import { UserError } from "./issue-writes";

/**
 * A team's cycles are a timeline, not a calendar: overlapping cycles would
 * make "the current cycle" ambiguous, so they are rejected. Callers that
 * genuinely need parallel iterations should use projects instead.
 */
export async function assertCycleWindow(
  teamId: string,
  startsAt: Date,
  endsAt: Date,
  excludeCycleId?: string,
): Promise<void> {
  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new UserError("A cycle must end after it starts.");
  }

  const siblings = await db
    .select({ id: cycles.id, number: cycles.number, startsAt: cycles.startsAt, endsAt: cycles.endsAt })
    .from(cycles)
    .where(
      excludeCycleId
        ? and(eq(cycles.teamId, teamId), ne(cycles.id, excludeCycleId))
        : eq(cycles.teamId, teamId),
    );

  const clash = siblings.find(
    (sibling) =>
      startsAt < new Date(sibling.endsAt) && endsAt > new Date(sibling.startsAt),
  );
  if (clash) {
    throw new UserError(`Those dates overlap Cycle ${clash.number}.`);
  }
}

/** Cycle numbers are allocated per team so nobody has to type one. */
export async function nextCycleNumber(teamId: string): Promise<number> {
  const [last] = await db
    .select({ number: cycles.number })
    .from(cycles)
    .where(eq(cycles.teamId, teamId))
    .orderBy(desc(cycles.number))
    .limit(1);
  return (last?.number ?? 0) + 1;
}
