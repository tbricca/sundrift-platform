import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { cycles } from "../drizzle/schema";
import { assertCycleWindow } from "../server/cycle-writes";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";

export default defineAction({
  description:
    "Update a cycle's optional name or its dates. Cycle state is always derived from the dates, and changing them never touches the issues in the cycle or their due dates.",
  schema: z.object({
    cycleId: z.string(),
    name: z.string().nullable().optional(),
    startsAt: z.string().optional().describe("ISO date"),
    endsAt: z.string().optional().describe("ISO date"),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const [cycle] = await db
      .select()
      .from(cycles)
      .where(eq(cycles.id, args.cycleId))
      .limit(1);
    if (!cycle) throw new UserError("Cycle not found.");

    const startsAt = args.startsAt ? new Date(args.startsAt) : cycle.startsAt;
    const endsAt = args.endsAt ? new Date(args.endsAt) : cycle.endsAt;

    const patch: Partial<typeof cycles.$inferInsert> = {};
    if (args.name !== undefined) patch.name = args.name;

    if (args.startsAt !== undefined || args.endsAt !== undefined) {
      await assertCycleWindow(cycle.teamId, startsAt, endsAt, cycle.id);
      patch.startsAt = startsAt;
      patch.endsAt = endsAt;
      // The cached status is deliberately left alone: syncTeamCycles owns that
      // transition, and it is the transition that triggers rollover.
    }

    if (Object.keys(patch).length) {
      await db.update(cycles).set(patch).where(eq(cycles.id, cycle.id));
    }

    return { id: cycle.id, updated: true };
  },
});
