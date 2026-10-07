import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { issues, milestones } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";

export default defineAction({
  description:
    "Update a milestone: rename, change description or target date, reorder via sortOrder, or delete it. Deleting a milestone detaches its issues instead of removing them.",
  schema: z.object({
    milestoneId: z.string(),
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    sortOrder: z
      .number()
      .optional()
      .describe("Fractional position; place between two neighbours."),
    delete: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const [milestone] = await db
      .select()
      .from(milestones)
      .where(eq(milestones.id, args.milestoneId))
      .limit(1);
    if (!milestone) {
      throw new UserError(`Milestone not found: ${args.milestoneId}`, 404);
    }

    if (args.delete) {
      await db
        .update(issues)
        .set({ milestoneId: null })
        .where(eq(issues.milestoneId, milestone.id));
      await db.delete(milestones).where(eq(milestones.id, milestone.id));
      return { id: milestone.id, deleted: true };
    }

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.targetDate !== undefined) {
      patch.targetDate = args.targetDate ? new Date(args.targetDate) : null;
    }
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;

    if (Object.keys(patch).length) {
      await db.update(milestones).set(patch).where(eq(milestones.id, milestone.id));
    }

    return { id: milestone.id, updated: true };
  },
});
