import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { entityLinks } from "../drizzle/schema";
import { db } from "../server/db";
import {
  nextLinkSortOrder,
  requireSafeUrl,
  resolveLinkTarget,
} from "../server/entity-links";
import { UserError, requireIssue } from "../server/issue-writes";
import { publishLinkChange } from "../server/realtime";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Attach a resource link to an issue or a project. Only http and https URLs are accepted; the URL is normalised before storage. Leave the title empty and the UI falls back to the host and path.",
  schema: z.object({
    entityType: z.enum(["issue", "project"]),
    entityId: z
      .string()
      .describe("Project id, or an issue id or identifier such as ENG-42."),
    url: z.string().describe("http or https URL."),
    title: z.string().nullable().optional(),
  }),
  http: { method: "POST" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace found.", 404);

    const requestedId =
      args.entityType === "issue"
        ? (await requireIssue(args.entityId)).id
        : args.entityId;
    const entityId = await resolveLinkTarget(
      args.entityType,
      requestedId,
      workspace.id,
    );

    const url = requireSafeUrl(args.url);

    const [created] = await db
      .insert(entityLinks)
      .values({
        workspaceId: workspace.id,
        entityType: args.entityType,
        entityId,
        url,
        title: args.title?.trim() || null,
        sortOrder: await nextLinkSortOrder(args.entityType, entityId),
        createdBy: await getCurrentMemberId(),
      })
      .returning();

    publishLinkChange(args.entityType, entityId);

    return { id: created.id, url: created.url, title: created.title };
  },
});
