/**
 * One data path for the Inbox and the sidebar badge.
 *
 * Reads and writes are keyed on `["action", "list-notifications"]`, so every
 * cached filter tab and the unread count stay in step, and a future realtime
 * push only has to invalidate the same key.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { markLocalWrite } from "@/hooks/use-beam-realtime";
import { useWorkspace } from "@/hooks/use-workspace";
import type { NotificationItem } from "@/lib/types";

export type InboxFilter = "all" | "unread" | "mentions";

export type NotificationsResult = {
  notifications: NotificationItem[];
  unreadCount: number;
};

const KEY = ["action", "list-notifications"] as const;

function isResult(data: unknown): data is NotificationsResult {
  return Boolean(data && typeof data === "object" && "notifications" in data);
}

/** Patches every cached filter tab at once. */
function patchCaches(
  queryClient: QueryClient,
  update: (result: NotificationsResult) => NotificationsResult,
) {
  queryClient.setQueriesData<unknown>({ queryKey: KEY }, (data: unknown) =>
    isResult(data) ? update(data) : data,
  );
}

function withUnreadCount(
  result: NotificationsResult,
  notifications: NotificationItem[],
): NotificationsResult {
  return {
    notifications,
    unreadCount: notifications.filter((item) => !item.readAt).length,
  };
}

export function useNotifications(filter: InboxFilter = "all") {
  const { data, isLoading } = useActionQuery<NotificationsResult>(
    "list-notifications",
    { filter },
  );
  return {
    notifications: data?.notifications ?? [],
    unreadCount: data?.unreadCount ?? 0,
    isLoading,
  };
}

/** Cheap poll-free unread count for the sidebar; shares the "all" cache. */
export function useUnreadCount(): number {
  const { data } = useActionQuery<NotificationsResult>("list-notifications", {
    filter: "all",
  });
  return data?.unreadCount ?? 0;
}

export function useNotificationMutations() {
  const queryClient = useQueryClient();
  // Notification events are addressed to a member, so that is the id whose
  // echo this tab suppresses while its own write settles.
  const { workspace } = useWorkspace();
  const memberId = workspace?.currentMemberId ?? undefined;

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: KEY });
  }, [queryClient]);

  const patch = useCallback(
    async (
      ids: string[],
      args: { read?: boolean; dismissed?: boolean },
      optimistic: (item: NotificationItem) => NotificationItem | null,
    ) => {
      if (ids.length === 0) return;
      markLocalWrite(memberId);
      const before = queryClient.getQueriesData({ queryKey: KEY });

      patchCaches(queryClient, (result) =>
        withUnreadCount(
          result,
          result.notifications.flatMap((item) => {
            if (!ids.includes(item.id)) return [item];
            const next = optimistic(item);
            return next ? [next] : [];
          }),
        ),
      );

      try {
        await callAction(
          "update-notification",
          { notificationIds: ids, ...args },
          { method: "PUT" },
        );
      } catch (error) {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update that notification.",
        );
      }
    },
    [memberId, queryClient],
  );

  const setRead = useCallback(
    (ids: string[], read: boolean) =>
      patch(ids, { read }, (item) => ({
        ...item,
        readAt: read ? (item.readAt ?? new Date().toISOString()) : null,
      })),
    [patch],
  );

  const dismiss = useCallback(
    (ids: string[]) => patch(ids, { dismissed: true }, () => null),
    [patch],
  );

  const markAllRead = useCallback(async () => {
    markLocalWrite(memberId);
    const before = queryClient.getQueriesData({ queryKey: KEY });
    const now = new Date().toISOString();
    patchCaches(queryClient, (result) =>
      withUnreadCount(
        result,
        result.notifications.map((item) => ({
          ...item,
          readAt: item.readAt ?? now,
        })),
      ),
    );

    try {
      await callAction("mark-all-notifications-read", {}, { method: "PUT" });
      // The Unread tab's cached list is now wrong by definition.
      refresh();
    } catch (error) {
      for (const [key, data] of before) queryClient.setQueryData(key, data);
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not mark notifications read.",
      );
    }
  }, [memberId, queryClient, refresh]);

  return { setRead, dismiss, markAllRead, refresh };
}
