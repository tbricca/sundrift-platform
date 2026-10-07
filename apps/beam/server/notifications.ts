/**
 * Every notification in Beam is written here. Write paths describe what
 * happened; this module decides who hears about it, drops the actor, dedupes
 * recipients, and stores enough denormalised context that the Inbox renders a
 * row without a query per notification.
 *
 * Recipient policy: rows are only created for `human` members. Agents are
 * first-class everywhere else (assignable, mentionable, subscribable) but the
 * app has a single human active-user concept, so no identity can currently
 * read an agent's Inbox. Widening this is a delivery-filter change, not a
 * second notification system.
 */
import { and, eq, inArray } from "drizzle-orm";

import { stripMentions } from "../app/lib/mentions";

import {
  favorites,
  issueSubscribers,
  members,
  notifications,
  projects,
} from "../drizzle/schema";
import { db } from "./db";
import { publishNotificationChange } from "./realtime";

export type NotificationType =
  | "issue_assigned"
  | "issue_mention"
  | "comment_mention"
  | "issue_comment"
  | "project_update";

type EntityType = "issue" | "project" | "comment";

export type NotificationMetadata = {
  issueIdentifier?: string;
  issueTitle?: string;
  projectName?: string;
  projectHealth?: string;
  commentId?: string;
  excerpt?: string;
  actorName?: string;
};

type NotifyArgs = {
  recipientIds: (string | null | undefined)[];
  type: NotificationType;
  entityType: EntityType;
  /** Navigation target: the issue or project the user should land on. */
  entityId: string;
  actorId?: string | null;
  metadata?: NotificationMetadata;
  /** Recipients already notified about this same event by a richer type. */
  exclude?: (string | null | undefined)[];
};

/** Members that can currently own an Inbox. */
async function deliverableIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.id, ids), eq(members.kind, "human")));
  return rows.map((row) => row.id);
}

/**
 * The one insert path. Returns the ids that were actually notified so callers
 * can exclude them from a follow-up, lower-priority event.
 */
export async function notifyMembers({
  recipientIds,
  type,
  entityType,
  entityId,
  actorId,
  metadata,
  exclude = [],
}: NotifyArgs): Promise<string[]> {
  const blocked = new Set([actorId, ...exclude].filter(Boolean) as string[]);
  const candidates = [
    ...new Set(recipientIds.filter(Boolean) as string[]),
  ].filter((id) => !blocked.has(id));

  const recipients = await deliverableIds(candidates);
  if (recipients.length === 0) return [];

  await db.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      actorId: actorId ?? null,
      type,
      entityType,
      entityId,
      metadata: (metadata ?? {}) as Record<string, unknown>,
    })),
  );
  publishNotificationChange(recipients);
  return recipients;
}

export async function subscribeToIssue(
  issueId: string,
  memberIds: (string | null | undefined)[],
): Promise<void> {
  const ids = [...new Set(memberIds.filter(Boolean) as string[])];
  if (ids.length === 0) return;
  await db
    .insert(issueSubscribers)
    .values(ids.map((memberId) => ({ issueId, memberId })))
    .onConflictDoNothing();
}

export async function unsubscribeFromIssue(
  issueId: string,
  memberId: string,
): Promise<void> {
  await db
    .delete(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.memberId, memberId),
      ),
    );
}

export async function issueSubscriberIds(issueId: string): Promise<string[]> {
  const rows = await db
    .select({ memberId: issueSubscribers.memberId })
    .from(issueSubscribers)
    .where(eq(issueSubscribers.issueId, issueId));
  return rows.map((row) => row.memberId);
}

export async function isSubscribed(
  issueId: string,
  memberId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ memberId: issueSubscribers.memberId })
    .from(issueSubscribers)
    .where(
      and(
        eq(issueSubscribers.issueId, issueId),
        eq(issueSubscribers.memberId, memberId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function memberName(id: string | null | undefined) {
  if (!id) return undefined;
  const [row] = await db
    .select({ name: members.name })
    .from(members)
    .where(eq(members.id, id))
    .limit(1);
  return row?.name;
}

/**
 * Project following reuses Favorites rather than adding a parallel junction:
 * favoriting a project is already the "I care about this" signal, and the lead
 * is always included.
 */
export async function projectFollowerIds(projectId: string): Promise<string[]> {
  const [followers, [project]] = await Promise.all([
    db
      .select({ userId: favorites.userId })
      .from(favorites)
      .where(
        and(
          eq(favorites.entityType, "project"),
          eq(favorites.entityId, projectId),
        ),
      ),
    db
      .select({ leadId: projects.leadId })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1),
  ]);
  return [
    ...new Set(
      [...followers.map((row) => row.userId), project?.leadId].filter(
        Boolean,
      ) as string[],
    ),
  ];
}

/** Shared shape for issue-scoped events. */
export type IssueEventContext = {
  issueId: string;
  identifier: string;
  title: string;
  actorId: string | null;
  actorName?: string;
};

/**
 * Mentions win over generic events: a mentioned member gets one mention
 * notification and is excluded from the comment/subscriber pass.
 */
export async function notifyIssueMentions(
  context: IssueEventContext,
  mentionIds: string[],
  options: { commentId?: string; excerpt?: string } = {},
): Promise<string[]> {
  if (mentionIds.length === 0) return [];
  const notified = await notifyMembers({
    recipientIds: mentionIds,
    type: options.commentId ? "comment_mention" : "issue_mention",
    entityType: "issue",
    entityId: context.issueId,
    actorId: context.actorId,
    metadata: {
      issueIdentifier: context.identifier,
      issueTitle: context.title,
      actorName: context.actorName,
      commentId: options.commentId,
      excerpt: options.excerpt,
    },
  });
  // Being mentioned means you now follow the conversation.
  await subscribeToIssue(context.issueId, mentionIds);
  return notified;
}

export async function notifyIssueSubscribers(
  context: IssueEventContext,
  options: { commentId: string; excerpt?: string; exclude?: string[] },
): Promise<string[]> {
  const subscribers = await issueSubscriberIds(context.issueId);
  return await notifyMembers({
    recipientIds: subscribers,
    type: "issue_comment",
    entityType: "issue",
    entityId: context.issueId,
    actorId: context.actorId,
    exclude: options.exclude,
    metadata: {
      issueIdentifier: context.identifier,
      issueTitle: context.title,
      actorName: context.actorName,
      commentId: options.commentId,
      excerpt: options.excerpt,
    },
  });
}

/** Short plain-text preview of a comment for the Inbox row. */
export function excerptOf(body: string, limit = 120): string {
  const flat = stripMentions(body).replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
}
