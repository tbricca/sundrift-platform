import type {
  activities,
  comments,
  cycles,
  issues,
  labels,
  members,
  milestones,
  projects,
  savedViews,
  teams,
  workflowStatuses,
  workspaces,
} from "../../drizzle/schema";

import type { Priority, StatusCategory, TriageStatus } from "./issue-query";

export type Workspace = typeof workspaces.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type WorkflowStatus = typeof workflowStatuses.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type NewIssue = typeof issues.$inferInsert;
export type Label = typeof labels.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Milestone = typeof milestones.$inferSelect;
export type Cycle = typeof cycles.$inferSelect;
export type SavedView = typeof savedViews.$inferSelect;

export type MemberKind = "human" | "agent";

export type MemberRef = {
  id: string;
  name: string;
  kind: string;
  avatarUrl: string | null;
};

export type LabelRef = { id: string; name: string; color: string };

export type StatusRef = {
  id: string;
  name: string;
  color: string;
  category: string;
  position: number;
};

export type TeamRef = {
  id: string;
  key: string;
  name: string;
  color: string | null;
};

/** One row in any list or board — the shape the query engine returns. */
export type IssueListItem = {
  id: string;
  identifier: string;
  identifierNumber: number;
  title: string;
  priority: Priority;
  estimate: number | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  deletedAt: string | null;
  /** Bumped on every write; pass back as expectedVersion to detect conflicts. */
  version: number;
  sortOrder: number;
  parentIssueId: string | null;
  /** Null when the issue never entered triage. */
  triageStatus: TriageStatus | null;
  triagedAt: string | null;
  snoozedUntil: string | null;
  triageSource: string | null;
  creator: MemberRef | null;
  team: TeamRef;
  status: StatusRef;
  assignee: MemberRef | null;
  project: { id: string; name: string } | null;
  cycle: { id: string; number: number; name: string | null } | null;
  labels: LabelRef[];
};

export type IssueGroupResult = {
  key: string;
  label: string;
  color: string | null;
  count: number;
  issues: IssueListItem[];
};

export type CommentEntry = {
  id: string;
  body: string;
  mentions: string[];
  createdAt: string;
  updatedAt: string;
  author: MemberRef | null;
};

/** `{ field, from, to }` with `{ id, name }` refs — never rendered prose. */
export type ActivityChangeRef = { id: string | null; name: string } | null;

export type ActivityMetadata = {
  field?: string;
  from?: ActivityChangeRef | string | number | boolean | null;
  to?: ActivityChangeRef | string | number | boolean | null;
  added?: { id: string; name: string }[];
  removed?: { id: string; name: string }[];
  [key: string]: unknown;
};

export type ActivityEntry = {
  id: string;
  type: string;
  metadata: ActivityMetadata | null;
  createdAt: string;
  actor: MemberRef | null;
};

export type RelationEntry = {
  id: string;
  type: "blocks" | "blocked_by" | "related" | "duplicate";
  issue: { id: string; identifier: string; title: string; statusColor: string };
};

export type IssueDetail = IssueListItem & {
  description: string | null;
  mentions: string[];
  milestone: { id: string; name: string } | null;
  createdBy: MemberRef | null;
  comments: CommentEntry[];
  activity: ActivityEntry[];
  relations: RelationEntry[];
  subIssues: IssueListItem[];
  /** Derived from children on read — never persisted. */
  subIssueProgress: { completed: number; total: number } | null;
  parent: { id: string; identifier: string; title: string } | null;
  /** Ancestor ids, used to block circular parenting in the picker. */
  ancestorIds: string[];
  /** Whether the current member gets this issue's comment notifications. */
  subscribed: boolean;
};

export type NotificationType =
  | "issue_assigned"
  | "issue_mention"
  | "comment_mention"
  | "issue_comment"
  | "project_update";

/** Denormalised display context; the Inbox never renders a stored sentence. */
export type NotificationMetadata = {
  issueIdentifier?: string;
  issueTitle?: string;
  projectName?: string;
  projectHealth?: string;
  commentId?: string;
  excerpt?: string;
  actorName?: string;
};

export type NotificationItem = {
  id: string;
  type: string;
  entityType: string;
  entityId: string;
  metadata: NotificationMetadata;
  readAt: string | null;
  createdAt: string;
  actor: MemberRef | null;
};

export type WorkspaceBootstrap = {
  workspace: { id: string; name: string; slug: string };
  currentMemberId: string | null;
  members: (MemberRef & { email: string | null })[];
  teams: (TeamRef & {
    description: string | null;
    icon: string | null;
    triageEnabled: boolean;
    defaultTriageAssigneeId: string | null;
    /** Pending review count for the sidebar badge, counted server-side. */
    pendingTriageCount: number;
    statuses: StatusRef[];
    cycles: {
      id: string;
      number: number;
      name: string | null;
      status: string;
      startsAt: string;
      endsAt: string;
    }[];
  })[];
  labels: (LabelRef & { teamId: string | null })[];
  projects: {
    id: string;
    name: string;
    summary: string | null;
    status: string;
    health: string;
    priority: Priority;
    targetDate: string | null;
    leadId: string | null;
    milestones: { id: string; name: string }[];
  }[];
  views: { id: string; name: string; teamId: string | null }[];
  favorites: { id: string; entityType: string; entityId: string }[];
};

/**
 * Global search results, grouped by entity. Every field here is something a
 * result row renders — search never returns a full detail payload.
 */
export type WorkspaceSearchResults = {
  query: string;
  issues: {
    id: string;
    identifier: string;
    title: string;
    description: string | null;
    updatedAt: string | null;
    archived: boolean;
    /** Null unless the issue is or was in a triage queue. */
    triageStatus: TriageStatus | null;
    /** The row surfaced because a comment matched, not the title. */
    commentMatched: boolean;
    team: { key: string; name: string; color: string | null };
    status: { name: string; color: string; category: string };
    assignee: { name: string; avatarUrl: string | null; kind: string } | null;
  }[];
  projects: {
    id: string;
    name: string;
    summary: string | null;
    description: string | null;
    status: string;
    health: string;
    targetDate: string | null;
    teamKeys: string[];
  }[];
  cycles: {
    id: string;
    number: number;
    name: string | null;
    startsAt: string;
    endsAt: string;
    state: string;
    team: { key: string; name: string };
  }[];
  views: {
    id: string;
    name: string;
    layout: string;
    teamKey: string | null;
  }[];
  members: {
    id: string;
    name: string;
    email: string | null;
    kind: string;
    avatarUrl: string | null;
  }[];
};

export type { Priority, StatusCategory, TriageStatus };
