import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { favorites, savedViews } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { publishViewChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description: "Delete a saved view and any favorites pointing at it.",
  schema: z.object({ id: z.string().describe("Saved view id.") }),
  http: { method: "DELETE" },
  run: async (args) => {
    const [view] = await db
      .select()
      .from(savedViews)
      .where(eq(savedViews.id, args.id))
      .limit(1);
    if (!view) throw new UserError(`Saved view not found: ${args.id}`, 404);

    const currentMemberId = await getCurrentMemberId();
    if (view.ownerId !== currentMemberId) {
      throw new UserError("You can only delete your own saved views.", 403);
    }

    await db
      .delete(favorites)
      .where(
        and(eq(favorites.entityType, "view"), eq(favorites.entityId, view.id)),
      );
    await db.delete(savedViews).where(eq(savedViews.id, view.id));

    publishViewChange(view.id);

    return { id: view.id, deleted: true };
  },
});
