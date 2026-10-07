import { defineAction } from "@agent-native/core/action";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { publishNotificationChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";
import { notifications } from "../drizzle/schema";

export default defineAction({
  description:
    "Patch one or more of the current member's notifications: mark read or unread, or dismiss them. A member can only ever change their own rows.",
  schema: z.object({
    notificationIds: z.array(z.string()).min(1),
    read: z.boolean().optional().describe("true marks read, false marks unread"),
    dismissed: z.boolean().optional().describe("true hides it from the Inbox"),
  }),
  http: { method: "PUT" },
  run: async ({ notificationIds, read, dismissed }) => {
    const userId = await getCurrentMemberId();
    if (!userId) throw new UserError("No current member.", 403);
    if (read === undefined && dismissed === undefined) {
      throw new UserError("Pass read or dismissed.");
    }

    const patch: Record<string, unknown> = {};
    if (read !== undefined) patch.readAt = read ? new Date() : null;
    if (dismissed !== undefined) patch.deletedAt = dismissed ? new Date() : null;

    // Ownership is part of the WHERE clause, so another member's ids simply
    // match nothing rather than leaking whether they exist.
    const updated = await db
      .update(notifications)
      .set(patch)
      .where(
        and(
          eq(notifications.userId, userId),
          inArray(notifications.id, notificationIds),
        ),
      )
      .returning({ id: notifications.id });

    // Read/dismiss state belongs to one member, so the member is the entity:
    // their other tabs pick it up and nobody else is affected.
    if (updated.length) publishNotificationChange([userId]);

    return { updatedCount: updated.length };
  },
});
