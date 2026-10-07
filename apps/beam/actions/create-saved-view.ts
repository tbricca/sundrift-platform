import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { savedViews } from "../drizzle/schema";
import { db } from "../server/db";
import { issueQuerySchema } from "../server/issue-query-schema";
import { UserError } from "../server/issue-writes";
import { queryToColumns } from "../server/saved-views";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Save an issue view. The view stores an IssueQuery descriptor (filters, grouping, ordering, layout, visibleColumns) that any issue surface can render.",
  schema: z.object({
    name: z.string().min(1).describe("Display name for the view."),
    query: issueQuerySchema.describe("The IssueQuery descriptor to persist."),
    teamId: z
      .string()
      .nullable()
      .optional()
      .describe("Scope the view to a team. Null for a workspace-wide view."),
    isShared: z
      .boolean()
      .optional()
      .describe("Share with the whole workspace instead of keeping it private."),
  }),
  http: { method: "POST" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace found.", 404);
    const ownerId = await getCurrentMemberId();
    if (!ownerId) throw new UserError("No current member to own this view.", 403);

    const [created] = await db
      .insert(savedViews)
      .values({
        workspaceId: workspace.id,
        ownerId,
        teamId: args.teamId ?? null,
        name: args.name.trim(),
        isShared: args.isShared ? 1 : 0,
        ...queryToColumns(args.query),
      })
      .returning();

    return { id: created.id, name: created.name };
  },
});
