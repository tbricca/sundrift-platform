import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { cycles, teams } from "../drizzle/schema";
import { addWeeks, alignToWeekday, cycleState } from "../app/lib/cycle";
import { assertCycleWindow, nextCycleNumber } from "../server/cycle-writes";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";

export default defineAction({
  description:
    "Create a cycle for a team. The number is allocated automatically and the dates default to the team's cycle duration starting after the last cycle, so normally only teamId is required.",
  schema: z.object({
    teamId: z.string(),
    name: z.string().min(1).optional().describe("Optional label, e.g. Launch"),
    startsAt: z.string().optional().describe("ISO date"),
    endsAt: z.string().optional().describe("ISO date"),
  }),
  run: async (args) => {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, args.teamId))
      .limit(1);
    if (!team) throw new UserError("Team not found.");

    const existing = await db
      .select()
      .from(cycles)
      .where(eq(cycles.teamId, team.id));

    const ordered = existing.sort((a, b) => a.number - b.number);
    const last = ordered[ordered.length - 1];
    const startsAt = args.startsAt
      ? new Date(args.startsAt)
      : last
        ? new Date(last.endsAt)
        : alignToWeekday(new Date(), team.cycleStartDay);
    const endsAt = args.endsAt
      ? new Date(args.endsAt)
      : addWeeks(startsAt, Math.max(1, team.cycleDurationWeeks));

    await assertCycleWindow(team.id, startsAt, endsAt);

    const [created] = await db
      .insert(cycles)
      .values({
        teamId: team.id,
        number: await nextCycleNumber(team.id),
        name: args.name ?? null,
        startsAt,
        endsAt,
        status: cycleState({ startsAt, endsAt }),
      })
      .returning();

    return { id: created.id, number: created.number };
  },
});
