/**
 * The Inbox surface. Rows are rendered purely from notification type plus
 * metadata (`notificationCopy`), so the list never needs a query per row, and
 * every write goes through the shared optimistic notification hook.
 */
import {
  IconAt,
  IconCheck,
  IconCircleDot,
  IconInbox,
  IconMessageCircle,
  IconProgressCheck,
  IconUserPlus,
  IconX,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";

import { MemberAvatar, formatRelative } from "@/components/issues/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useNotificationMutations,
  useNotifications,
  type InboxFilter,
} from "@/hooks/use-notifications";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import { publishInboxContext } from "@/lib/agent-inbox-context";
import {
  groupCopy,
  groupNotificationIds,
  inboxSections,
  type NotificationGroup,
} from "@/lib/notification-copy";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import type { NotificationItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const FILTERS: { id: InboxFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "mentions", label: "Mentions" },
];

const TYPE_ICON: Record<string, typeof IconAt> = {
  issue_assigned: IconUserPlus,
  issue_mention: IconAt,
  comment_mention: IconAt,
  issue_comment: IconMessageCircle,
  project_update: IconProgressCheck,
};

const EMPTY: Record<InboxFilter, string> = {
  all: "You're all caught up.",
  unread: "No unread notifications.",
  mentions: "No mentions.",
};

export function InboxList() {
  const [filter, setFilter] = useState<InboxFilter>("all");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const navigate = useNavigate();

  const { notifications, unreadCount, isLoading } = useNotifications(filter);
  const { setRead, dismiss, markAllRead } = useNotificationMutations();

  const sections = useMemo(() => inboxSections(notifications), [notifications]);
  const ordered = useMemo(
    () => sections.flatMap((section) => section.items),
    [sections],
  );

  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const focusedRef = useRef(focusedId);
  focusedRef.current = focusedId;

  // Let view-screen describe the Inbox the way the user sees it.
  useEffect(() => {
    publishInboxContext({ filter, unreadCount, focusedId });
    return () => publishInboxContext(null);
  }, [filter, unreadCount, focusedId]);

  // Opening a group clears every notification it stands for: the user has
  // seen all of them, whatever the row happened to collapse into one line.
  const open = useCallback(
    (group: NotificationGroup) => {
      const unread = group.notifications
        .filter((notification) => !notification.readAt)
        .map((notification) => notification.id);
      if (unread.length) void setRead(unread, true);
      const { href } = groupCopy(group);
      if (href) navigate(href);
    },
    [navigate, setRead],
  );

  const move = useCallback((delta: number) => {
    const list = orderedRef.current;
    if (list.length === 0) return false;
    const index = list.findIndex((item) => item.id === focusedRef.current);
    const next =
      index === -1 ? 0 : Math.min(list.length - 1, Math.max(0, index + delta));
    setFocusedId(list[next].id);
    return true;
  }, []);

  useShortcuts(
    {
      [shortcutKeys("nav.next")]: () => move(1),
      [shortcutKeys("nav.prev")]: () => move(-1),
      [shortcutKeys("nav.open")]: () => {
        const item = orderedRef.current.find(
          (entry) => entry.id === focusedRef.current,
        );
        if (!item) return false;
        open(item);
        return true;
      },
      [shortcutKeys("inbox.toggleRead")]: () => {
        const item = orderedRef.current.find(
          (entry) => entry.id === focusedRef.current,
        );
        if (!item) return false;
        void setRead(groupNotificationIds(item), item.unreadCount === 0);
        return true;
      },
      [shortcutKeys("nav.escape")]: () => {
        if (!focusedRef.current) return false;
        setFocusedId(null);
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.view },
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border px-3">
        <div
          className="flex items-center gap-0.5"
          role="tablist"
          aria-label="Inbox filter"
        >
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              onClick={() => setFilter(tab.id)}
              className={cn(
                "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors",
                filter === tab.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
              )}
            >
              {tab.label}
              {tab.id === "unread" && unreadCount > 0 ? (
                <span className="beam-meta text-primary">{unreadCount}</span>
              ) : null}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void markAllRead()}
          disabled={unreadCount === 0}
          className="ms-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <IconCheck className="size-3.5" />
          Mark all read
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : ordered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
          <div className="flex size-11 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
            <IconInbox className="size-5" />
          </div>
          <p className="text-sm text-muted-foreground">{EMPTY[filter]}</p>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {sections.map((section) => (
            <section key={section.bucket}>
              <h2 className="beam-meta sticky top-0 z-10 border-b border-border/70 bg-background/95 px-3 py-1.5 uppercase tracking-wide backdrop-blur">
                {section.bucket}
              </h2>
              <ul>
                {section.items.map((group) => (
                  <NotificationRow
                    key={group.id}
                    group={group}
                    focused={group.id === focusedId}
                    onFocus={() => setFocusedId(group.id)}
                    onOpen={() => open(group)}
                    onToggleRead={() =>
                      void setRead(
                        groupNotificationIds(group),
                        group.unreadCount === 0,
                      )
                    }
                    onDismiss={() => void dismiss(groupNotificationIds(group))}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  group,
  focused,
  onFocus,
  onOpen,
  onToggleRead,
  onDismiss,
}: {
  group: NotificationGroup;
  focused: boolean;
  onFocus: () => void;
  onOpen: () => void;
  onToggleRead: () => void;
  onDismiss: () => void;
}) {
  const copy = groupCopy(group);
  const Icon = TYPE_ICON[group.type] ?? IconCircleDot;
  const unread = group.unreadCount > 0;

  return (
    <li
      onMouseEnter={onFocus}
      className={cn(
        "group flex h-10 items-center gap-2.5 border-b border-border/70 px-3 text-[13px] transition-colors",
        focused && "bg-muted/60",
        unread && "bg-primary/[0.035]",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      <span className="sr-only">{unread ? "Unread" : "Read"}</span>

      <ActorStack actors={group.actors} />
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />

      <button
        type="button"
        onClick={onOpen}
        onFocus={onFocus}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-start"
      >
        <span className={cn("truncate", unread && "font-medium")}>
          {copy.text}
        </span>
        {copy.detail ? (
          <span className="beam-meta hidden min-w-0 truncate font-normal sm:block">
            {copy.detail}
          </span>
        ) : null}
      </button>

      {group.unreadCount > 1 ? (
        <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 text-[10px] font-medium leading-[15px] text-primary">
          {group.unreadCount}
        </span>
      ) : null}

      <span className="beam-meta shrink-0 tabular-nums">
        {formatRelative(group.latestAt)}
      </span>

      <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          onClick={onToggleRead}
          aria-label={unread ? "Mark read" : "Mark unread"}
          title={unread ? "Mark read" : "Mark unread"}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {unread ? (
            <IconCheck className="size-3.5" />
          ) : (
            <IconCircleDot className="size-3.5" />
          )}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss notification"
          title="Dismiss"
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      </span>
    </li>
  );
}

/** Up to three overlapping avatars — the row must not get taller. */
function ActorStack({ actors }: { actors: NotificationGroup["actors"] }) {
  if (actors.length === 0) return <MemberAvatar member={null} size={20} />;
  const shown = actors.slice(0, 3);
  return (
    <span className="flex shrink-0 items-center -space-x-1.5">
      {shown.map((actor) => (
        <MemberAvatar
          key={actor.id}
          member={actor}
          size={20}
          className="ring-1 ring-background"
        />
      ))}
    </span>
  );
}
