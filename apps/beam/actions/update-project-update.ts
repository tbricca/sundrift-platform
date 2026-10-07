import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { projectUpdates, projects } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { getCurrentMemberId } from "../server/workspace";

import { projectHealthSchema } from "./create-project";

/** Keeps project health equal to the health of the newest remaining update. */
async function syncProjectHealth(projectId: string) {
  const [latest] = await db
    .select({ health: projectUpdates.health })
    .from(projectUpdates)
    .where(eq(projectUpdates.projectId, projectId))
    .orderBy(desc(projectUpdates.createdAt))
    .limit(1);

  await db
    .update(projects)
    .set({ health: latest?.health ?? "no_update", updatedAt: new Date() })
    .where(eq(projects.id, projectId));
}

export default defineAction({
  description:
    "Edit or delete one of your own project updates. Project health follows the newest remaining update.",
  schema: z.object({
    updateId: z.string(),
    body: z.string().min(1).optional(),
    health: projectHealthSchema.optional(),
    delete: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const [update] = await db
      .select()
      .from(projectUpdates)
      .where(eq(projectUpdates.id, args.updateId))
      .limit(1);
    if (!update) {
      throw new UserError(`Project update not found: ${args.updateId}`, 404);
    }

    const currentMemberId = await getCurrentMemberId();
    if (update.authorId !== currentMemberId) {
      throw new UserError("You can only change your own project updates.", 403);
    }

    if (args.delete) {
      await db.delete(projectUpdates).where(eq(projectUpdates.id, update.id));
      await syncProjectHealth(update.projectId);
      return { id: update.id, deleted: true };
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (args.body !== undefined) patch.body = args.body;
    if (args.health !== undefined) patch.health = args.health;

    await db
      .update(projectUpdates)
      .set(patch)
      .where(eq(projectUpdates.id, update.id));
    await syncProjectHealth(update.projectId);

    return { id: update.id, updated: true };
  },
});
