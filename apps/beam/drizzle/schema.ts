import { randomUUID } from "node:crypto";

import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const memberKind = pgEnum("member_kind", ["human", "agent"]);
export const workspaceRole = pgEnum("workspace_role", ["admin", "member"]);
export const statusCategory = pgEnum("status_category", [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);
export const issuePriority = pgEnum("issue_priority", [
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);
export const projectStatus = pgEnum("project_status", [
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
]);
export const projectHealth = pgEnum("project_health", [
  "no_update",
  "on_track",
  "at_risk",
  "off_track",
]);
export const cycleStatus = pgEnum("cycle_status", [
  "upcoming",
  "active",
  "completed",
]);
export const viewLayout = pgEnum("view_layout", ["list", "board"]);
export const relationType = pgEnum("relation_type", [
  "blocks",
  "blocked_by",
  "related",
  "duplicate",
]);
export const favoriteEntity = pgEnum("favorite_entity", [
  "issue",
  "project",
  "team",
  "view",
  "cycle",
]);
/**
 * Triage is review state, not workflow state: an issue keeps its normal
 * status the whole time. Null means the issue never entered triage.
 */
export const triageStatus = pgEnum("triage_status", [
  "pending",
  "accepted",
  "declined",
  "snoozed",
]);

export const notificationEntity = pgEnum("notification_entity", [
  "issue",
  "project",
  "comment",
]);

/** What a resource link can hang off. One table, not one per entity. */
export const linkEntity = pgEnum("link_entity", ["issue", "project"]);

/**
 * Deliberately three cadences, not cron. Anything a team cannot describe in one
 * sentence belongs in a real scheduler, not in an issue tracker.
 */
export const recurrenceCadence = pgEnum("recurrence_cadence", [
  "daily",
  "weekly",
  "monthly",
]);

/**
 * Cycles expire, so a recurrence stores the intent rather than a cycle id and
 * resolves it against the team at the moment the issue is created.
 */
export const recurrenceCycleMode = pgEnum("recurrence_cycle_mode", [
  "none",
  "current_cycle",
  "next_cycle",
]);

export const recurrenceRunStatus = pgEnum("recurrence_run_status", [
  "pending",
  "succeeded",
  "failed",
  "skipped",
]);

/** Why an issue entered a cycle. `system` covers backfill and migrations. */
export const cycleMembershipAddReason = pgEnum("cycle_membership_add_reason", [
  "manual",
  "bulk",
  "created_in_cycle",
  "recurring",
  "rollover",
  "system",
]);

/** Why an issue left a cycle. Finishing the work is NOT a removal. */
export const cycleMembershipRemoveReason = pgEnum(
  "cycle_membership_remove_reason",
  ["manual", "bulk", "rollover", "cycle_changed", "issue_deleted", "system"],
);

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => randomUUID());

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: createdAt(),
});

/**
 * Humans and agents share one roster so an agent is assignable anywhere a
 * person is (assignee, commenter, activity actor, project lead).
 */
export const members = pgTable("members", {
  id: id(),
  name: text("name").notNull(),
  email: text("email"),
  avatarUrl: text("avatar_url"),
  kind: memberKind("kind").notNull().default("human"),
  createdAt: createdAt(),
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    role: workspaceRole("role").notNull().default("member"),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.userId] })],
);

export const teams = pgTable(
  "teams",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    description: text("description"),
    icon: text("icon"),
    color: text("color"),
    /** Atomically incremented to allocate the next `TEAMKEY-n` identifier. */
    nextIssueNumber: integer("next_issue_number").notNull().default(1),
    /** Cycle settings are strictly one-per-team, so they live here. */
    cyclesEnabled: boolean("cycles_enabled").notNull().default(true),
    cycleDurationWeeks: integer("cycle_duration_weeks").notNull().default(2),
    /** 0 = Sunday, matching Date#getUTCDay. */
    cycleStartDay: integer("cycle_start_day").notNull().default(1),
    cycleAutoCreate: boolean("cycle_auto_create").notNull().default(true),
    cycleAutoRollover: boolean("cycle_auto_rollover").notNull().default(true),
    /**
     * When `issue_cycle_memberships` started recording this team's history.
     * Cycles that began before this are missing their real membership
     * intervals, so scope metrics report unavailable rather than zero.
     */
    cycleHistoryStartedAt: timestamp("cycle_history_started_at", {
      withTimezone: true,
    })
      .notNull()
      .defaultNow(),
    /** Off by default: a team opts in to reviewing incoming issues. */
    triageEnabled: boolean("triage_enabled").notNull().default(false),
    defaultTriageAssigneeId: text("default_triage_assignee_id"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("teams_workspace_key_idx").on(table.workspaceId, table.key),
  ],
);

export const teamMembers = pgTable(
  "team_members",
  {
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.teamId, table.userId] })],
);

export const workflowStatuses = pgTable(
  "workflow_statuses",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
    category: statusCategory("category").notNull(),
    position: integer("position").notNull().default(0),
  },
  (table) => [
    index("workflow_statuses_team_idx").on(table.teamId, table.position),
  ],
);

export const projects = pgTable("projects", {
  id: id(),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  summary: text("summary"),
  description: text("description"),
  status: projectStatus("status").notNull().default("planned"),
  priority: issuePriority("priority").notNull().default("none"),
  leadId: text("lead_id").references(() => members.id, {
    onDelete: "set null",
  }),
  startDate: timestamp("start_date", { withTimezone: true }),
  targetDate: timestamp("target_date", { withTimezone: true }),
  health: projectHealth("health").notNull().default("no_update"),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

/**
 * Human-readable progress history for a project. Posting an update also moves
 * the project's current health, so health is never stale relative to the last
 * thing someone said about the project.
 */
export const projectUpdates = pgTable(
  "project_updates",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => members.id, {
      onDelete: "set null",
    }),
    health: projectHealth("health").notNull().default("on_track"),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("project_updates_project_idx").on(table.projectId),
    index("project_updates_created_idx").on(table.createdAt),
  ],
);

export const projectTeams = pgTable(
  "project_teams",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.projectId, table.teamId] })],
);

export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    targetDate: timestamp("target_date", { withTimezone: true }),
    sortOrder: real("sort_order").notNull().default(0),
  },
  (table) => [index("milestones_project_idx").on(table.projectId)],
);

export const cycles = pgTable(
  "cycles",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: cycleStatus("status").notNull().default("upcoming"),
  },
  (table) => [
    uniqueIndex("cycles_team_number_idx").on(table.teamId, table.number),
  ],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    identifierNumber: integer("identifier_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    statusId: text("status_id")
      .notNull()
      .references(() => workflowStatuses.id),
    priority: issuePriority("priority").notNull().default("none"),
    assigneeId: text("assignee_id").references(() => members.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    cycleId: text("cycle_id").references(() => cycles.id, {
      onDelete: "set null",
    }),
    milestoneId: text("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    parentIssueId: text("parent_issue_id"),
    estimate: integer("estimate"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    createdBy: text("created_by").references(() => members.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Soft delete. Every issue query excludes these unless asked otherwise. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * Authoritative mutation counter. Writers pass the version they read and
     * the update is rejected if another human or agent bumped it first.
     */
    version: integer("version").notNull().default(1),
    /** Member ids referenced by @mentions in the description. */
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    /** Null for issues that never entered triage. */
    triageStatus: triageStatus("triage_status"),
    triagedAt: timestamp("triaged_at", { withTimezone: true }),
    triagedBy: text("triaged_by").references(() => members.id, {
      onDelete: "set null",
    }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /** Free-form origin: manual, agent, api, or a future integration name. */
    triageSource: text("triage_source"),
    /**
     * Set when a recurring rule generated this issue. The issue is otherwise
     * completely ordinary — this is provenance, not a second issue type, and it
     * survives the rule being archived so history stays explicable.
     */
    recurringDefinitionId: text("recurring_definition_id").references(
      () => recurringIssueDefinitions.id,
      { onDelete: "set null" },
    ),
    /** Fractional so manual reorder inserts between neighbours. */
    sortOrder: real("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("issues_team_number_idx").on(
      table.teamId,
      table.identifierNumber,
    ),
    index("issues_deleted_idx").on(table.deletedAt),
    index("issues_team_status_idx").on(table.teamId, table.statusId),
    index("issues_assignee_idx").on(table.assigneeId),
    index("issues_project_idx").on(table.projectId),
    index("issues_cycle_idx").on(table.cycleId),
    index("issues_parent_idx").on(table.parentIssueId),
    index("issues_archived_idx").on(table.archivedAt),
    index("issues_triage_idx").on(table.teamId, table.triageStatus),
    // Global search runs unanchored ILIKE over these; without trigrams that
    // is a sequential scan of every issue on every keystroke.
    index("issues_title_trgm_idx").using(
      "gin",
      sql`${table.title} gin_trgm_ops`,
    ),
    index("issues_description_trgm_idx").using(
      "gin",
      sql`${table.description} gin_trgm_ops`,
    ),
  ],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull(),
  },
  (table) => [index("labels_workspace_idx").on(table.workspaceId)],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.issueId, table.labelId] })],
);

export const comments = pgTable(
  "comments",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    /** Member ids referenced by @mentions in the body. */
    mentions: jsonb("mentions").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("comments_issue_idx").on(table.issueId),
    index("comments_body_trgm_idx").using(
      "gin",
      sql`${table.body} gin_trgm_ops`,
    ),
  ],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => members.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (table) => [index("activities_issue_idx").on(table.issueId)],
);

export const issueRelations = pgTable(
  "issue_relations",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    relatedIssueId: text("related_issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    type: relationType("type").notNull(),
  },
  (table) => [
    index("issue_relations_issue_idx").on(table.issueId),
    uniqueIndex("issue_relations_unique_idx").on(
      table.issueId,
      table.relatedIssueId,
      table.type,
    ),
  ],
);

export const savedViews = pgTable(
  "saved_views",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull(),
    layout: viewLayout("layout").notNull().default("list"),
    grouping: text("grouping"),
    ordering: jsonb("ordering").$type<unknown[]>().notNull(),
    visibleColumns: jsonb("visible_columns").$type<string[]>().notNull(),
    isShared: integer("is_shared").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("saved_views_workspace_idx").on(table.workspaceId)],
);

export const favorites = pgTable(
  "favorites",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    entityType: favoriteEntity("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    sortOrder: real("sort_order").notNull().default(0),
  },
  (table) => [
    index("favorites_user_idx").on(table.userId),
    uniqueIndex("favorites_unique_idx").on(
      table.userId,
      table.entityType,
      table.entityId,
    ),
  ],
);

/**
 * A template is a set of defaults for `create-issue`, stored as real
 * references rather than an opaque payload so the same foreign keys that
 * protect an issue protect a template. Every field is optional: a template
 * that only carries a description is legitimate.
 *
 * Deletes are soft (`archivedAt`) because a template is a team habit, and
 * dropping one should not be harder to undo than dropping an issue.
 */
export const issueTemplates = pgTable(
  "issue_templates",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    titleTemplate: text("title_template"),
    issueDescription: text("issue_description"),
    priority: issuePriority("priority"),
    statusId: text("status_id").references(() => workflowStatuses.id, {
      onDelete: "set null",
    }),
    assigneeId: text("assignee_id").references(() => members.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    cycleId: text("cycle_id").references(() => cycles.id, {
      onDelete: "set null",
    }),
    milestoneId: text("milestone_id").references(() => milestones.id, {
      onDelete: "set null",
    }),
    estimate: integer("estimate"),
    /** Resolved against the creation date, never stored on the issue. */
    dueDateOffsetDays: integer("due_date_offset_days"),
    createdBy: text("created_by").references(() => members.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("issue_templates_team_idx").on(table.teamId),
    index("issue_templates_workspace_idx").on(table.workspaceId),
  ],
);

export const issueTemplateLabels = pgTable(
  "issue_template_labels",
  {
    templateId: text("template_id")
      .notNull()
      .references(() => issueTemplates.id, { onDelete: "cascade" }),
    labelId: text("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.templateId, table.labelId] })],
);

/**
 * A rule that creates issues on a schedule.
 *
 * It stores the schedule and a pointer to a template — never a copy of the
 * template's contents. Editing the template changes what future issues look
 * like, which is the entire reason recurrences reference templates instead of
 * carrying their own issue fields.
 *
 * Generated issues are ordinary rows in `issues`. Nothing about the work lives
 * here.
 */
export const recurringIssueDefinitions = pgTable(
  "recurring_issue_definitions",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    templateId: text("template_id").references(() => issueTemplates.id, {
      onDelete: "set null",
    }),
    enabled: boolean("enabled").notNull().default(true),
    cadence: recurrenceCadence("cadence").notNull(),
    /** Every N days / weeks / months. */
    interval: integer("interval").notNull().default(1),
    /** Weekly only: 0 = Sunday. Null for other cadences. */
    weekdays: jsonb("weekdays").$type<number[]>(),
    /** Monthly only, clamped to the length of short months at run time. */
    dayOfMonth: integer("day_of_month"),
    /** Wall-clock "HH:MM" in `timezone`, never an offset. */
    timeOfDay: text("time_of_day").notNull().default("09:00"),
    /** IANA id. Required: a schedule without one is ambiguous twice a year. */
    timezone: text("timezone").notNull().default("UTC"),
    cycleMode: recurrenceCycleMode("cycle_mode").notNull().default("none"),
    /** Optional override applied on top of the template. */
    assigneeId: text("assignee_id").references(() => members.id, {
      onDelete: "set null",
    }),
    projectId: text("project_id").references(() => projects.id, {
      onDelete: "set null",
    }),
    startsAt: timestamp("starts_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** Absolute instant of the next occurrence, recomputed after every run. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: text("created_by").references(() => members.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("recurring_definitions_team_idx").on(table.teamId),
    /**
     * The processor's only query: enabled, unarchived and due. Partial so the
     * index stays small however many disabled or archived rules accumulate.
     */
    index("recurring_definitions_due_idx")
      .on(table.nextRunAt)
      .where(sql`${table.enabled} = true and ${table.archivedAt} is null`),
  ],
);

/**
 * One row per scheduled occurrence, and the reason duplicate issues cannot
 * happen.
 *
 * A processor claims an occurrence by inserting `(definition, scheduled_for)`
 * with `ON CONFLICT DO NOTHING`. Exactly one caller gets a row back; everyone
 * else sees the conflict and moves on. The unique index is the lock — there is
 * no application-level coordination to get wrong.
 *
 * Manual runs are recorded here too, with a null `scheduled_for`, so they are
 * visible in history without ever colliding with a scheduled slot.
 */
export const recurringIssueRuns = pgTable(
  "recurring_issue_runs",
  {
    id: id(),
    definitionId: text("definition_id")
      .notNull()
      .references(() => recurringIssueDefinitions.id, { onDelete: "cascade" }),
    /** The occurrence this claims. Null for a manual "Run now". */
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    issueId: text("issue_id").references(() => issues.id, {
      onDelete: "set null",
    }),
    status: recurrenceRunStatus("status").notNull().default("pending"),
    /** Short, human-readable reason a run failed. */
    error: text("error"),
    manual: boolean("manual").notNull().default(false),
    createdAt: createdAt(),
  },
  (table) => [
    /**
     * Postgres treats nulls as distinct in a unique index, so manual runs
     * (`scheduled_for is null`) never conflict with each other or with a
     * scheduled slot. That is exactly the behaviour wanted here.
     */
    uniqueIndex("recurring_runs_occurrence_idx").on(
      table.definitionId,
      table.scheduledFor,
    ),
    index("recurring_runs_definition_idx").on(
      table.definitionId,
      table.createdAt,
    ),
  ],
);

/**
 * Which cycle an issue belonged to, and when.
 *
 * `issues.cycle_id` stays the authoritative CURRENT assignment and is what
 * every issue view reads. This table is the append-only record behind it, so
 * cycle analytics can answer "what did we commit to on day one" after a
 * rollover has already rewritten `issues.cycle_id`.
 *
 * One row is one closed-open interval: the issue was in `cycle_id` from
 * `added_at` until `removed_at`, or still is when `removed_at` is null.
 * Membership tracks ASSIGNMENT, not progress — completing an issue leaves its
 * membership open, and a cycle ending does not close anything.
 *
 * Never written by hand. It is a side effect of the normal cycle write paths,
 * all of which funnel through `server/issue-cycle-membership.ts`.
 */
export const issueCycleMemberships = pgTable(
  "issue_cycle_memberships",
  {
    id: id(),
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    cycleId: text("cycle_id")
      .notNull()
      .references(() => cycles.id, { onDelete: "cascade" }),
    /** Denormalised from the issue so team-scoped history stays one query. */
    teamId: text("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    addedAt: timestamp("added_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    addedBy: text("added_by").references(() => members.id, {
      onDelete: "set null",
    }),
    removedBy: text("removed_by").references(() => members.id, {
      onDelete: "set null",
    }),
    addReason: cycleMembershipAddReason("add_reason")
      .notNull()
      .default("manual"),
    removeReason: cycleMembershipRemoveReason("remove_reason"),
  },
  (table) => [
    /**
     * An issue sits in at most one cycle at a time, which mirrors the single
     * `issues.cycle_id` column. This index is what makes a double-write
     * physically impossible rather than merely unlikely.
     */
    uniqueIndex("issue_cycle_membership_open_idx")
      .on(table.issueId)
      .where(sql`${table.removedAt} is null`),
    /** Scope-added and committed-at-start both scan a cycle by entry time. */
    index("issue_cycle_membership_cycle_added_idx").on(
      table.cycleId,
      table.addedAt,
    ),
    /** Scope-removed and carryover-out scan a cycle by exit time. */
    index("issue_cycle_membership_cycle_removed_idx").on(
      table.cycleId,
      table.removedAt,
    ),
    index("issue_cycle_membership_issue_idx").on(table.issueId),
  ],
);

/**
 * Resource links: a URL and an optional title hung off an issue or a project.
 * Polymorphic on purpose — the two entities need identical behaviour, and a
 * second table would mean a second set of actions and a second UI.
 *
 * No foreign key to the target, since the column addresses two tables; the
 * write path checks the target exists and belongs to the workspace instead.
 */
export const entityLinks = pgTable(
  "entity_links",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    entityType: linkEntity("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    sortOrder: real("sort_order").notNull().default(0),
    createdBy: text("created_by").references(() => members.id, {
      onDelete: "set null",
    }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("entity_links_entity_idx").on(table.entityType, table.entityId),
  ],
);

/**
 * Subscribers receive an issue's comment notifications. Membership is
 * additive: creating, being assigned, commenting or being mentioned subscribes
 * you, and only an explicit unsubscribe removes you.
 */
export const issueSubscribers = pgTable(
  "issue_subscribers",
  {
    issueId: text("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.issueId, table.memberId] }),
    index("issue_subscribers_member_idx").on(table.memberId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** Null for system events; Beam never invents a member row for itself. */
    actorId: text("actor_id").references(() => members.id, {
      onDelete: "set null",
    }),
    type: text("type").notNull(),
    entityType: notificationEntity("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    readAt: timestamp("read_at", { withTimezone: true }),
    /** Dismissing hides a row without losing the event. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("notifications_user_idx").on(table.userId),
    /**
     * The Inbox list. Every read filters dismissed rows out, so the partial
     * index is both smaller than a plain composite and a complete match for
     * the query shape.
     */
    index("notifications_inbox_idx")
      .on(table.userId, table.createdAt.desc())
      .where(sql`${table.deletedAt} is null`),
    /** The sidebar unread badge and "mark all read", which share a predicate. */
    index("notifications_unread_idx")
      .on(table.userId)
      .where(sql`${table.deletedAt} is null and ${table.readAt} is null`),
  ],
);

export const teamsRelations = relations(teams, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [teams.workspaceId],
    references: [workspaces.id],
  }),
  statuses: many(workflowStatuses),
  issues: many(issues),
  cycles: many(cycles),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
  team: one(teams, { fields: [issues.teamId], references: [teams.id] }),
  status: one(workflowStatuses, {
    fields: [issues.statusId],
    references: [workflowStatuses.id],
  }),
  assignee: one(members, {
    fields: [issues.assigneeId],
    references: [members.id],
  }),
  project: one(projects, {
    fields: [issues.projectId],
    references: [projects.id],
  }),
  cycle: one(cycles, { fields: [issues.cycleId], references: [cycles.id] }),
  milestone: one(milestones, {
    fields: [issues.milestoneId],
    references: [milestones.id],
  }),
  labels: many(issueLabels),
  comments: many(comments),
  activities: many(activities),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
  issue: one(issues, {
    fields: [issueLabels.issueId],
    references: [issues.id],
  }),
  label: one(labels, {
    fields: [issueLabels.labelId],
    references: [labels.id],
  }),
}));
