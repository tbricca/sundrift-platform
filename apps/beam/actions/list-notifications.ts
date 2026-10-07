import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { NotificationItem } from "../app/lib/types";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { getCurrentMemberId } from "../server/workspace";
import { members, notifications } from "../drizzle/schema";

export default defineAction({
  description:
    "The current member's Inbox: notifications about assignments, mentions, comments on subscribed issues and project updates, newest first. Rows carry denormalised context (issue identifier, title, actor name) so no follow-up read is needed to render them.",
  schema: z.object({
    filter: z
      .enum(["all", "unread", "mentions"])
      .default("all")
      .describe("Inbox tab: all, unread only, or mentions only"),
    limit: z.coerce.number().int().min(1).max(200).default(100),
  }),
  http: { method: "GET" },
  run: async ({ filter, limit }) => {
    const userId = await getCurrentMemberId();
    if (!userId) return { notifications: [], unreadCount: 0 };

    const visible = and(
      eq(notifications.userId, userId),
      isNull(notifications.deletedAt),
    );

    const scoped =
      filter === "unread"
        ? and(visible, isNull(notifications.readAt))
        : filter === "mentions"
          ? and(
              visible,
              sql`${notifications.type} in ('issue_mention', 'comment_mention')`,
            )
          : visible;

    const [rows, [counts]] = await Promise.all([
      db
        .select({ notification: notifications, actor: members })
        .from(notifications)
        .leftJoin(members, eq(notifications.actorId, members.id))
        .where(scoped)
        .orderBy(desc(notifications.createdAt))
        .limit(limit),
      db
        .select({ unread: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(visible, isNull(notifications.readAt))),
    ]);

    const items: NotificationItem[] = rows.map(({ notification, actor }) => ({
      id: notification.id,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      metadata: (notification.metadata ?? {}) as NotificationItem["metadata"],
      readAt: iso(notification.readAt),
      createdAt: iso(notification.createdAt)!,
      actor: actor
        ? {
            id: actor.id,
            name: actor.name,
            kind: actor.kind,
            avatarUrl: actor.avatarUrl,
          }
        : null,
    }));

    return { notifications: items, unreadCount: counts?.unread ?? 0 };
  },
});
