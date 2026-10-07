import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { entityLinks } from "../drizzle/schema";
import { db } from "../server/db";
import { requireLink } from "../server/entity-links";
import { publishLinkChange } from "../server/realtime";

export default defineAction({
  description: "Remove a resource link from its issue or project.",
  schema: z.object({ id: z.string() }),
  http: { method: "DELETE" },
  run: async ({ id }) => {
    const link = await requireLink(id);

    await db.delete(entityLinks).where(eq(entityLinks.id, link.id));

    publishLinkChange(link.entityType, link.entityId);

    return { id: link.id, deleted: true };
  },
});
