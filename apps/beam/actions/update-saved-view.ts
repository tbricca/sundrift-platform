import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { savedViews } from "../drizzle/schema";
import { db } from "../server/db";
import { issueQuerySchema } from "../server/issue-query-schema";
import { UserError } from "../server/issue-writes";
import { publishViewChange } from "../server/realtime";
import { queryToColumns } from "../server/saved-views";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description:
    "Update a saved view: rename it, change its team scope or sharing, or overwrite its stored IssueQuery with the current configuration.",
  schema: z.object({
    id: z.string().describe("Saved view id."),
    name: z.string().min(1).optional(),
    query: issueQuerySchema
      .optional()
      .describe("Replacement IssueQuery descriptor."),
    teamId: z.string().nullable().optional(),
    isShared: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const [view] = await db
      .select()
      .from(savedViews)
      .where(eq(savedViews.id, args.id))
      .limit(1);
    if (!view) throw new UserError(`Saved view not found: ${args.id}`, 404);

    const currentMemberId = await getCurrentMemberId();
    if (view.ownerId !== currentMemberId) {
      throw new UserError("You can only change your own saved views.", 403);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.teamId !== undefined) patch.teamId = args.teamId;
    if (args.isShared !== undefined) patch.isShared = args.isShared ? 1 : 0;
    if (args.query) Object.assign(patch, queryToColumns(args.query));

    await db.update(savedViews).set(patch).where(eq(savedViews.id, view.id));

    publishViewChange(view.id);

    return { id: view.id, updated: true };
  },
});
