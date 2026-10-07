/**
 * Inbox rows are rendered from the notification type plus its structured
 * metadata — the server never stores a finished sentence, so copy can change
 * without a migration and stale names never outlive a rename.
 */
import type { NotificationItem } from "./types";

export type NotificationCopy = {
  /** Sentence describing the event, e.g. "Priya assigned ENG-42 to you". */
  text: string;
  /** Secondary line: issue title, project name or a comment excerpt. */
  detail: string | null;
  /** Where clicking the row goes. Null when the target no longer resolves. */
  href: string | null;
  isMention: boolean;
};

const HEALTH_LABEL: Record<string, string> = {
  no_update: "No update",
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

/** Beam itself is the actor for system events; no member row is invented. */
export function actorLabel(notification: NotificationItem): string {
  return notification.actor?.name ?? notification.metadata.actorName ?? "Beam";
}

export function notificationCopy(
  notification: NotificationItem,
): NotificationCopy {
  const actor = actorLabel(notification);
  const { issueIdentifier, issueTitle, projectName, projectHealth, excerpt } =
    notification.metadata;
  const issueHref = issueIdentifier ? `/issue/${issueIdentifier}` : null;

  switch (notification.type) {
    case "issue_assigned":
      return {
        text: `${actor} assigned ${issueIdentifier} to you`,
        detail: issueTitle ?? null,
        href: issueHref,
        isMention: false,
      };
    case "issue_mention":
      return {
        text: `${actor} mentioned you in ${issueIdentifier}`,
        detail: issueTitle ?? null,
        href: issueHref,
        isMention: true,
      };
    case "comment_mention":
      return {
        text: `${actor} mentioned you in a comment on ${issueIdentifier}`,
        detail: excerpt ?? issueTitle ?? null,
        href: issueHref,
        isMention: true,
      };
    case "issue_comment":
      return {
        text: `${actor} commented on ${issueIdentifier}`,
        detail: excerpt ?? issueTitle ?? null,
        href: issueHref,
        isMention: false,
      };
    case "project_update": {
      const health = projectHealth ? HEALTH_LABEL[projectHealth] : null;
      return {
        text: `${actor} posted an update to ${projectName ?? "a project"}${
          health ? ` — ${health}` : ""
        }`,
        detail: excerpt ?? null,
        href: `/projects/${notification.entityId}/updates`,
        isMention: false,
      };
    }
    default:
      return {
        text: `${actor} updated ${issueIdentifier ?? projectName ?? "something"}`,
        detail: issueTitle ?? null,
        href: issueHref,
        isMention: false,
      };
  }
}

/**
 * Types that are safe to collapse into one row. Mentions and assignments are
 * personally directed — three people mentioning you is three things you have
 * to read, not one — so they always stay individual.
 */
const GROUPABLE = new Set(["issue_comment", "project_update"]);

/** Rows only merge inside this window, so yesterday never folds into today. */
export const GROUP_WINDOW_MS = 6 * 60 * 60 * 1000;

/**
 * A presentation-only view over notification rows. Nothing is written: the
 * underlying notifications keep their own ids, read state and history, and
 * every group action fans back out to them.
 */
export type NotificationGroup = {
  /** Stable across refetches: derived from the rows, not generated. */
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  notifications: NotificationItem[];
  /** Most recent actor first, deduped. */
  actors: {
    id: string;
    name: string;
    kind: string;
    avatarUrl: string | null;
  }[];
  unreadCount: number;
  latestAt: string;
};

function actorOf(notification: NotificationItem) {
  if (notification.actor) return notification.actor;
  const name = notification.metadata.actorName;
  return name
    ? { id: `name:${name}`, name, kind: "human", avatarUrl: null }
    : null;
}

/**
 * Collapse compatible notifications into rows.
 *
 * Compatible means: same type, same entity, within `GROUP_WINDOW_MS` of the
 * newest row already in the group. Input is assumed newest-first, which is the
 * order `list-notifications` returns.
 */
export function groupCompatible(
  notifications: NotificationItem[],
): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const openByKey = new Map<string, NotificationGroup>();

  for (const notification of notifications) {
    const key = `${notification.type}:${notification.entityType}:${notification.entityId}`;
    const open = GROUPABLE.has(notification.type)
      ? openByKey.get(key)
      : undefined;

    const withinWindow =
      open &&
      new Date(open.latestAt).getTime() -
        new Date(notification.createdAt).getTime() <=
        GROUP_WINDOW_MS;

    if (open && withinWindow) {
      open.notifications.push(notification);
      if (!notification.readAt) open.unreadCount += 1;
      const actor = actorOf(notification);
      if (actor && !open.actors.some((entry) => entry.id === actor.id)) {
        open.actors.push(actor);
      }
      continue;
    }

    const actor = actorOf(notification);
    const group: NotificationGroup = {
      id: notification.id,
      type: notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      notifications: [notification],
      actors: actor ? [actor] : [],
      unreadCount: notification.readAt ? 0 : 1,
      latestAt: notification.createdAt,
    };
    groups.push(group);
    if (GROUPABLE.has(notification.type)) openByKey.set(key, group);
  }

  return groups;
}

/** Every underlying row id, for read/unread/dismiss fan-out. */
export function groupNotificationIds(group: NotificationGroup): string[] {
  return group.notifications.map((notification) => notification.id);
}

/** "Ana", "Ana and Tom", "Ana, Tom and 3 others". */
export function actorList(names: string[]): string {
  if (names.length === 0) return "Someone";
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  // Naming a third person is shorter than calling them "1 other".
  if (names.length === 3) return `${names[0]}, ${names[1]} and ${names[2]}`;
  return `${names[0]}, ${names[1]} and ${names.length - 2} others`;
}

/**
 * Copy for a row. A single-notification group reads exactly as it did before
 * grouping existed, so nothing regressed for the common case.
 */
export function groupCopy(group: NotificationGroup): NotificationCopy {
  const newest = group.notifications[0];
  if (group.notifications.length === 1) return notificationCopy(newest);

  const names = group.actors.map((actor) => actor.name);
  const count = group.notifications.length;
  const { issueIdentifier, projectName } = newest.metadata;

  if (group.type === "project_update") {
    return {
      text: `${count} new updates in ${projectName ?? "a project"}`,
      detail: actorList(names),
      href: `/projects/${group.entityId}/updates`,
      isMention: false,
    };
  }

  return {
    text: `${actorList(names)} commented on ${issueIdentifier}`,
    detail: `${count} new comments`,
    href: issueIdentifier ? `/issue/${issueIdentifier}` : null,
    isMention: false,
  };
}

export type NotificationBucket = "Today" | "Yesterday" | "Earlier";

export function bucketOf(
  createdAt: string,
  now = new Date(),
): NotificationBucket {
  const created = new Date(createdAt);
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (created.getTime() >= startOfToday) return "Today";
  if (created.getTime() >= startOfToday - 86_400_000) return "Yesterday";
  return "Earlier";
}

export const BUCKET_ORDER: NotificationBucket[] = [
  "Today",
  "Yesterday",
  "Earlier",
];

/**
 * The Inbox in display order: compatible rows collapsed, then bucketed by day.
 * Grouping happens first so a group is dated by its newest notification.
 */
export function inboxSections(
  notifications: NotificationItem[],
  now = new Date(),
): { bucket: NotificationBucket; items: NotificationGroup[] }[] {
  const groups = groupCompatible(notifications);
  return BUCKET_ORDER.map((bucket) => ({
    bucket,
    items: groups.filter((group) => bucketOf(group.latestAt, now) === bucket),
  })).filter((section) => section.items.length > 0);
}
