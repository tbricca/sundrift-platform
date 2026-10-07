/**
 * The single view descriptor behind every issue surface in the app.
 *
 * Backlog, My Issues, cycles, projects, saved views, list and board are all the
 * same query with different filters/grouping/ordering/layout — there is no
 * separate data structure for any of them.
 */

export type StatusCategory =
  "backlog" | "unstarted" | "started" | "completed" | "canceled";

export type Priority = "none" | "low" | "medium" | "high" | "urgent";

export type IssueGrouping =
  "status" | "assignee" | "priority" | "project" | "cycle" | "label" | "none";

export type IssueOrderField =
  "manual" | "priority" | "updatedAt" | "createdAt" | "dueDate" | "title";

export type IssueOrdering = {
  field: IssueOrderField;
  direction: "asc" | "desc";
};

export type IssueLayout = "list" | "board";

export type TriageStatus = "pending" | "accepted" | "declined" | "snoozed";

/**
 * Triage scope. Leaving this unset is the important case: every normal view
 * hides issues still awaiting review, so Team Issues, Backlog, My Issues and
 * cycles never surface an unreviewed intake item.
 *
 * - `pending` waits for review, including snoozes whose time has passed
 * - `snoozed` still has time to run
 * - `accepted` and `declined` are already reviewed
 * - `any` applies no triage condition at all
 */
export type TriageScope =
  "pending" | "snoozed" | "accepted" | "declined" | "any";

/**
 * Negated matches. Same shape as the positive filters and ANDed as
 * `NOT (...)`, which is what backs the "is not" and "excludes" operators.
 * Keeping exclusions in their own block leaves room for nested AND/OR groups
 * later without changing the meaning of the existing fields.
 */
export type IssueExclusions = {
  teamId?: string[];
  statusId?: string[];
  statusCategory?: StatusCategory[];
  assigneeId?: (string | null)[];
  priority?: Priority[];
  labelId?: string[];
  projectId?: (string | null)[];
  cycleId?: (string | null)[];
  milestoneId?: (string | null)[];
  creatorId?: string[];
};

export type IssueFilters = {
  teamId?: string[];
  statusId?: string[];
  statusCategory?: StatusCategory[];
  /** `null` matches unassigned issues. */
  assigneeId?: (string | null)[];
  priority?: Priority[];
  labelId?: string[];
  projectId?: (string | null)[];
  cycleId?: (string | null)[];
  milestoneId?: (string | null)[];
  creatorId?: string[];
  parentIssueId?: string | null;
  search?: string;
  includeArchived?: boolean;
  /** Internal/admin only — never set from a user-facing view. */
  includeDeleted?: boolean;
  dueBefore?: string;
  dueAfter?: string;
  /** `true` matches issues with a due date, `false` matches issues without. */
  dueSet?: boolean;
  createdBefore?: string;
  createdAfter?: string;
  updatedBefore?: string;
  updatedAfter?: string;
  issueId?: string[];
  /** Unset means "hide issues that are still awaiting triage". */
  triage?: TriageScope;
  exclude?: IssueExclusions;
};

export type IssueQuery = {
  filters: IssueFilters;
  grouping: IssueGrouping;
  ordering: IssueOrdering[];
  layout: IssueLayout;
  visibleColumns: string[];
};

/**
 * Every property a row can render, in render order. `visibleColumns` is always
 * rebuilt in this order so that two identical column sets serialize to the same
 * URL and a reordered set never reads as a dirty view.
 *
 * `title` is deliberately not toggleable — a row with no title is not a row —
 * which also guarantees the list can never become empty, since an empty
 * `visibleColumns` means "show everything" everywhere else in the engine.
 */
export const ISSUE_COLUMNS = [
  { id: "priority", label: "Priority", board: true, fixed: false },
  { id: "identifier", label: "ID", board: true, fixed: false },
  { id: "title", label: "Title", board: true, fixed: true },
  { id: "status", label: "Status", board: false, fixed: false },
  { id: "labels", label: "Labels", board: true, fixed: false },
  { id: "project", label: "Project", board: false, fixed: false },
  { id: "cycle", label: "Cycle", board: false, fixed: false },
  { id: "estimate", label: "Estimate", board: false, fixed: false },
  { id: "dueDate", label: "Due date", board: false, fixed: false },
  { id: "source", label: "Source", board: false, fixed: false },
  { id: "createdAt", label: "Created", board: false, fixed: false },
  { id: "updatedAt", label: "Updated", board: false, fixed: false },
  { id: "assignee", label: "Assignee", board: true, fixed: false },
] as const satisfies readonly {
  id: string;
  label: string;
  board: boolean;
  fixed: boolean;
}[];

export type IssueColumnId = (typeof ISSUE_COLUMNS)[number]["id"];

const COLUMN_ORDER = ISSUE_COLUMNS.map((column) => column.id) as string[];

/** Adds or removes one column, keeping the canonical order. */
export function toggleColumn(
  columns: string[],
  id: string,
  visible: boolean,
): string[] {
  const next = new Set(columns);
  if (visible) next.add(id);
  else next.delete(id);
  for (const column of ISSUE_COLUMNS) {
    if (column.fixed) next.add(column.id);
  }
  return COLUMN_ORDER.filter((column) => next.has(column));
}

export const DEFAULT_VISIBLE_COLUMNS = [
  "priority",
  "identifier",
  "title",
  "status",
  "labels",
  "project",
  "dueDate",
  "updatedAt",
  "assignee",
];

export const DEFAULT_ISSUE_QUERY: IssueQuery = {
  filters: {},
  grouping: "status",
  ordering: [{ field: "manual", direction: "asc" }],
  layout: "list",
  visibleColumns: DEFAULT_VISIBLE_COLUMNS,
};

export function issueQuery(patch: Partial<IssueQuery> = {}): IssueQuery {
  return {
    ...DEFAULT_ISSUE_QUERY,
    ...patch,
    filters: { ...DEFAULT_ISSUE_QUERY.filters, ...patch.filters },
  };
}

export function teamIssuesQuery(teamId: string): IssueQuery {
  return issueQuery({ filters: { teamId: [teamId] } });
}

export function backlogQuery(teamId: string): IssueQuery {
  return issueQuery({
    filters: { teamId: [teamId], statusCategory: ["backlog"] },
    grouping: "none",
    ordering: [{ field: "priority", direction: "desc" }],
  });
}

export function myIssuesQuery(memberId: string): IssueQuery {
  return issueQuery({
    filters: {
      assigneeId: [memberId],
      statusCategory: ["backlog", "unstarted", "started"],
    },
  });
}

export function cycleQuery(cycleId: string): IssueQuery {
  return issueQuery({ filters: { cycleId: [cycleId] } });
}

/**
 * The review queue: oldest first, ungrouped, list only. Same engine as every
 * other surface — triage is a filter, not a second fetch path.
 */
export function triageQuery(
  teamId: string,
  scope: TriageScope = "pending",
): IssueQuery {
  return issueQuery({
    filters: { teamId: [teamId], triage: scope },
    grouping: "none",
    ordering: [{ field: "createdAt", direction: "asc" }],
    layout: "list",
    visibleColumns: [
      "priority",
      "identifier",
      "title",
      "status",
      "labels",
      "project",
      "source",
      "createdAt",
      "assignee",
    ],
  });
}

export const TRIAGE_SCOPE_LABEL: Record<TriageScope, string> = {
  pending: "Pending",
  snoozed: "Snoozed",
  accepted: "Accepted",
  declined: "Declined",
  any: "All",
};

export function projectIssuesQuery(projectId: string): IssueQuery {
  return issueQuery({
    filters: { projectId: [projectId] },
    grouping: "status",
  });
}

/** Alias kept because both names read naturally at call sites. */
export const projectQuery = projectIssuesQuery;

export function milestoneQuery(
  projectId: string,
  milestoneId: string,
): IssueQuery {
  return issueQuery({
    filters: { projectId: [projectId], milestoneId: [milestoneId] },
    grouping: "status",
  });
}

export const PRIORITY_ORDER: Priority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
  none: 0,
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const STATUS_CATEGORY_LABEL: Record<StatusCategory, string> = {
  backlog: "Backlog",
  unstarted: "Todo",
  started: "In Progress",
  completed: "Done",
  canceled: "Canceled",
};

export const GROUPING_LABEL: Record<IssueGrouping, string> = {
  status: "Status",
  assignee: "Assignee",
  priority: "Priority",
  project: "Project",
  cycle: "Cycle",
  label: "Label",
  none: "No grouping",
};

export const ORDER_FIELD_LABEL: Record<IssueOrderField, string> = {
  manual: "Manual",
  priority: "Priority",
  updatedAt: "Last updated",
  createdAt: "Created",
  dueDate: "Due date",
  title: "Title",
};

export function formatIdentifier(teamKey: string, number: number): string {
  return `${teamKey}-${number}`;
}

export function parseIdentifier(
  identifier: string,
): { teamKey: string; number: number } | null {
  const match = /^([A-Za-z][A-Za-z0-9]*)-(\d+)$/.exec(identifier.trim());
  if (!match) return null;
  return { teamKey: match[1].toUpperCase(), number: Number(match[2]) };
}
