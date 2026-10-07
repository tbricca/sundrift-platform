import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { entityLinks } from "../drizzle/schema";
import { db } from "../server/db";
import { requireLink, requireSafeUrl } from "../server/entity-links";
import { UserError } from "../server/issue-writes";
import { publishLinkChange } from "../server/realtime";

export default defineAction({
  description:
    "Rename a resource link, change its URL, or move it in the list.",
  schema: z.object({
    id: z.string(),
    url: z.string().optional(),
    title: z.string().nullable().optional(),
    sortOrder: z.coerce.number().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const link = await requireLink(args.id);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (args.url !== undefined) patch.url = requireSafeUrl(args.url);
    if (args.title !== undefined) patch.title = args.title?.trim() || null;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;

    if (Object.keys(patch).length === 1) {
      throw new UserError("Pass url, title or sortOrder.");
    }

    const [updated] = await db
      .update(entityLinks)
      .set(patch)
      .where(eq(entityLinks.id, link.id))
      .returning();

    publishLinkChange(link.entityType, link.entityId);

    return { id: updated.id, url: updated.url, title: updated.title };
  },
});
