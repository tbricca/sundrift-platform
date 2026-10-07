import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { milestones } from "../drizzle/schema";
import { db } from "../server/db";
import { requireProject } from "../server/project-writes";

export default defineAction({
  description: "Add a milestone to a project.",
  schema: z.object({
    projectId: z.string(),
    name: z.string().min(1),
    description: z.string().optional(),
    targetDate: z.string().nullable().optional(),
  }),
  http: { method: "POST" },
  run: async (args) => {
    const project = await requireProject(args.projectId);

    const [last] = await db
      .select({ sortOrder: milestones.sortOrder })
      .from(milestones)
      .where(eq(milestones.projectId, project.id))
      .orderBy(desc(milestones.sortOrder))
      .limit(1);

    const [created] = await db
      .insert(milestones)
      .values({
        projectId: project.id,
        name: args.name.trim(),
        description: args.description ?? null,
        targetDate: args.targetDate ? new Date(args.targetDate) : null,
        sortOrder: (last?.sortOrder ?? 0) + 1000,
      })
      .returning();

    return { id: created.id, name: created.name };
  },
});
