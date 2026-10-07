import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { teams } from "../drizzle/schema";
import { syncTeamCycles } from "../server/cycle-maintenance";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";

export default defineAction({
  description:
    "Update a team's cycle settings: whether cycles are enabled, cycle length in weeks, which weekday cycles start on, and whether upcoming cycles and rollover of unfinished issues happen automatically.",
  schema: z.object({
    teamId: z.string(),
    cyclesEnabled: z.boolean().optional(),
    durationWeeks: z.number().int().min(1).max(8).optional(),
    startDay: z
      .number()
      .int()
      .min(0)
      .max(6)
      .optional()
      .describe("0 = Sunday"),
    autoCreate: z.boolean().optional(),
    autoRollover: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const patch: Partial<typeof teams.$inferInsert> = {};
    if (args.cyclesEnabled !== undefined) patch.cyclesEnabled = args.cyclesEnabled;
    if (args.durationWeeks !== undefined)
      patch.cycleDurationWeeks = args.durationWeeks;
    if (args.startDay !== undefined) patch.cycleStartDay = args.startDay;
    if (args.autoCreate !== undefined) patch.cycleAutoCreate = args.autoCreate;
    if (args.autoRollover !== undefined)
      patch.cycleAutoRollover = args.autoRollover;

    if (Object.keys(patch).length === 0) return { updated: false };

    const [team] = await db
      .update(teams)
      .set(patch)
      .where(eq(teams.id, args.teamId))
      .returning();
    if (!team) throw new UserError("Team not found.");

    await syncTeamCycles(team.id);
    return { updated: true };
  },
});
