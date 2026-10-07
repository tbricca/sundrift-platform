import { defineAction } from "@agent-native/core/action";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { favorites } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description:
    "Favorite or unfavorite an entity for the current member. Favorites appear in the sidebar in manual order.",
  schema: z.object({
    entityType: z.enum(["issue", "project", "team", "view", "cycle"]),
    entityId: z.string(),
    favorite: z
      .boolean()
      .describe("true adds the favorite, false removes it."),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const userId = await getCurrentMemberId();
    if (!userId) throw new UserError("No current member.", 403);

    const where = and(
      eq(favorites.userId, userId),
      eq(favorites.entityType, args.entityType),
      eq(favorites.entityId, args.entityId),
    );

    if (!args.favorite) {
      await db.delete(favorites).where(where);
      return { favorite: false };
    }

    const [existing] = await db.select().from(favorites).where(where).limit(1);
    if (existing) return { favorite: true, id: existing.id };

    const [last] = await db
      .select({ sortOrder: favorites.sortOrder })
      .from(favorites)
      .where(eq(favorites.userId, userId))
      .orderBy(desc(favorites.sortOrder))
      .limit(1);

    const [created] = await db
      .insert(favorites)
      .values({
        userId,
        entityType: args.entityType,
        entityId: args.entityId,
        sortOrder: (last?.sortOrder ?? 0) + 1000,
      })
      .returning();

    return { favorite: true, id: created.id };
  },
});
