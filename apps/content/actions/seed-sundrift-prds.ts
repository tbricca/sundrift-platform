import { defineAction } from "@agent-native/core/action";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server/request-context";
import { DEMO_PRODUCT_DEV } from "@sundrift/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

const LOCAL_OWNER = "local@localhost";

export default defineAction({
  description:
    "Seed Sundrift product PRDs for Care+ loyalty, packing AI, and prepaid returns. Idempotent. Owned by the signed-in user, or the local content owner when auth is off.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const ownerEmail = getRequestUserEmail() || LOCAL_OWNER;
    const orgId = getRequestOrgId() ?? null;
    const db = getDb();
    const now = new Date().toISOString();
    const documents = [];

    for (const [index, story] of DEMO_PRODUCT_DEV.entries()) {
      const [existing] = await db
        .select()
        .from(schema.documents)
        .where(eq(schema.documents.id, story.prdId))
        .limit(1);
      if (existing) {
        documents.push({
          id: existing.id,
          title: existing.title,
          path: `/page/${existing.id}`,
          created: false,
        });
        continue;
      }
      await db.insert(schema.documents).values({
        id: story.prdId,
        title: story.prdTitle,
        content: story.prdMarkdown,
        description: story.summary,
        position: index,
        isFavorite: 0,
        hideFromSearch: 0,
        ownerEmail,
        orgId,
        visibility: "private",
        createdAt: now,
        updatedAt: now,
      });
      documents.push({
        id: story.prdId,
        title: story.prdTitle,
        path: `/page/${story.prdId}`,
        created: true,
      });
    }

    return {
      documents,
      ownerEmail,
      summary: "Loyalty, packing AI, and returns PRDs are in Content.",
    };
  },
});
