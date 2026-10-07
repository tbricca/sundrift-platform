import { defineAction } from "@agent-native/core/action";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import { publishNotificationChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";
import { notifications } from "../drizzle/schema";

export default defineAction({
  description:
    "Mark every unread notification of the current member as read. Dismissed notifications are left alone.",
  schema: z.object({}),
  http: { method: "PUT" },
  run: async () => {
    const userId = await getCurrentMemberId();
    if (!userId) return { updatedCount: 0 };

    const updated = await db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          isNull(notifications.deletedAt),
        ),
      )
      .returning({ id: notifications.id });

    if (updated.length) publishNotificationChange([userId]);

    return { updatedCount: updated.length };
  },
});
