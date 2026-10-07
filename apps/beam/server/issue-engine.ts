import {
  and,
  asc,
  desc,
  eq,
  exists,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import {
  DEFAULT_ISSUE_QUERY,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  PRIORITY_RANK,
  formatIdentifier,
  type IssueExclusions,
  type IssueGrouping,
  type IssueQuery,
  type TriageScope,
} from "../app/lib/issue-query";
import type { IssueGroupResult, IssueListItem } from "../app/lib/types";
import {
  cycles,
  issueLabels,
  issues,
  labels,
  members,
  projects,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

import { db } from "./db";

export type EngineIssue = IssueListItem;
export type IssueGroup = IssueGroupResult;

export function iso(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

/** `col IN (ids)` plus an explicit `IS NULL` arm when the filter includes null. */
function anyOfNullable(
  column: AnyPgColumn,
  values: (string | null)[],
): SQL | undefined {
  const ids = values.filter((value): value is string => value !== null);
  const parts: SQL[] = [];
  if (ids.length) parts.push(inArray(column, ids));
  if (values.includes(null)) parts.push(isNull(column));
  return or(...parts);
}

/** Issues carrying at least one of these labels. */
function hasAnyLabel(labelIds: string[]): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(issueLabels)
      .where(
        and(
          eq(issueLabels.issueId, issues.id),
          inArray(issueLabels.labelId, labelIds),
        ),
      ),
  );
}

/**
 * The only place triage state becomes SQL.
 *
 * An unset scope is what every normal preset uses, so unreviewed intake stays
 * out of Team Issues, Backlog, My Issues and cycles without a single preset
 * opting out. A snooze also resurfaces by time rather than by a cron: once
 * `snoozed_until` has passed, the row counts as pending again.
 */
function triageClause(scope: TriageScope | undefined): SQL | undefined {
  const now = new Date();
  const dueAgain = and(
    eq(issues.triageStatus, "snoozed"),
    lt(issues.snoozedUntil, now),
  ) as SQL;

  switch (scope) {
    case "any":
      return undefined;
    case "pending":
      return or(eq(issues.triageStatus, "pending"), dueAgain);
    case "snoozed":
      return and(
        eq(issues.triageStatus, "snoozed"),
        gt(issues.snoozedUntil, now),
      );
    case "accepted":
      return eq(issues.triageStatus, "accepted");
    case "declined":
      return eq(issues.triageStatus, "declined");
    default:
      return or(
        isNull(issues.triageStatus),
        inArray(issues.triageStatus, ["accepted", "declined"]),
      );
  }
}

/**
 * Exclusions read as `NOT (match)`. Nullable columns get an explicit
 * `IS NULL` escape hatch so "assignee is not Ana" still returns unassigned
 * issues rather than dropping them on three-valued logic.
 */
function exclusionClauses(exclude: IssueExclusions): SQL[] {
  const clauses: SQL[] = [];

  const excludeNullable = (column: AnyPgColumn, values: (string | null)[]) => {
    const match = anyOfNullable(column, values);
    if (!match) return;
    clauses.push(
      values.includes(null) ? not(match) : (or(not(match), isNull(column)) as SQL),
    );
  };

  if (exclude.teamId?.length) {
    clauses.push(not(inArray(issues.teamId, exclude.teamId)));
  }
  if (exclude.statusId?.length) {
    clauses.push(not(inArray(issues.statusId, exclude.statusId)));
  }
  if (exclude.statusCategory?.length) {
    clauses.push(not(inArray(workflowStatuses.category, exclude.statusCategory)));
  }
  if (exclude.priority?.length) {
    clauses.push(not(inArray(issues.priority, exclude.priority)));
  }
  if (exclude.assigneeId?.length) {
    excludeNullable(issues.assigneeId, exclude.assigneeId);
  }
  if (exclude.projectId?.length) {
    excludeNullable(issues.projectId, exclude.projectId);
  }
  if (exclude.cycleId?.length) {
    excludeNullable(issues.cycleId, exclude.cycleId);
  }
  if (exclude.milestoneId?.length) {
    excludeNullable(issues.milestoneId, exclude.milestoneId);
  }
  if (exclude.creatorId?.length) {
    clauses.push(
      or(
        not(inArray(issues.createdBy, exclude.creatorId)),
        isNull(issues.createdBy),
      ) as SQL,
    );
  }
  if (exclude.labelId?.length) {
    clauses.push(not(hasAnyLabel(exclude.labelId)));
  }

  return clauses;
}

export function buildIssueWhere(query: IssueQuery): SQL | undefined {
  const f = query.filters;
  const clauses: (SQL | undefined)[] = [];

  clauses.push(triageClause(f.triage));
  if (!f.includeDeleted) clauses.push(isNull(issues.deletedAt));
  if (!f.includeArchived) clauses.push(isNull(issues.archivedAt));
  if (f.issueId?.length) clauses.push(inArray(issues.id, f.issueId));
  if (f.teamId?.length) clauses.push(inArray(issues.teamId, f.teamId));
  if (f.statusId?.length) clauses.push(inArray(issues.statusId, f.statusId));
  if (f.statusCategory?.length) {
    clauses.push(inArray(workflowStatuses.category, f.statusCategory));
  }
  if (f.priority?.length) clauses.push(inArray(issues.priority, f.priority));
  if (f.creatorId?.length) {
    clauses.push(inArray(issues.createdBy, f.creatorId));
  }
  if (f.labelId?.length) clauses.push(hasAnyLabel(f.labelId));

  if (f.assigneeId?.length) {
    clauses.push(anyOfNullable(issues.assigneeId, f.assigneeId));
  }
  if (f.projectId?.length) {
    clauses.push(anyOfNullable(issues.projectId, f.projectId));
  }
  if (f.cycleId?.length) {
    clauses.push(anyOfNullable(issues.cycleId, f.cycleId));
  }
  if (f.milestoneId?.length) {
    clauses.push(anyOfNullable(issues.milestoneId, f.milestoneId));
  }

  if (f.parentIssueId === null) clauses.push(isNull(issues.parentIssueId));
  else if (f.parentIssueId) {
    clauses.push(eq(issues.parentIssueId, f.parentIssueId));
  }

  if (f.search?.trim()) {
    clauses.push(ilike(issues.title, `%${f.search.trim()}%`));
  }

  if (f.dueBefore) clauses.push(lt(issues.dueDate, new Date(f.dueBefore)));
  if (f.dueAfter) clauses.push(gt(issues.dueDate, new Date(f.dueAfter)));
  if (f.dueSet !== undefined) {
    clauses.push(f.dueSet ? isNotNull(issues.dueDate) : isNull(issues.dueDate));
  }
  if (f.createdBefore) {
    clauses.push(lt(issues.createdAt, new Date(f.createdBefore)));
  }
  if (f.createdAfter) {
    clauses.push(gt(issues.createdAt, new Date(f.createdAfter)));
  }
  if (f.updatedBefore) {
    clauses.push(lt(issues.updatedAt, new Date(f.updatedBefore)));
  }
  if (f.updatedAfter) {
    clauses.push(gt(issues.updatedAt, new Date(f.updatedAfter)));
  }

  if (f.exclude) clauses.push(...exclusionClauses(f.exclude));

  const defined = clauses.filter(Boolean) as SQL[];
  return defined.length ? and(...defined) : undefined;
}

function orderByClauses(query: IssueQuery) {
  const clauses = query.ordering.map((rule) => {
    const dir = rule.direction === "desc" ? desc : asc;
    switch (rule.field) {
      case "updatedAt":
        return dir(issues.updatedAt);
      case "createdAt":
        return dir(issues.createdAt);
      case "dueDate":
        return dir(issues.dueDate);
      case "title":
        return dir(issues.title);
      case "priority":
      case "manual":
      default:
        return dir(issues.sortOrder);
    }
  });
  clauses.push(desc(issues.updatedAt));
  return clauses;
}

/** Priority is a Postgres enum, so rank ordering is applied after the fetch. */
function applyPrioritySort(
  rows: IssueListItem[],
  query: IssueQuery,
): IssueListItem[] {
  const rule = query.ordering.find((entry) => entry.field === "priority");
  if (!rule) return rows;
  const factor = rule.direction === "desc" ? -1 : 1;
  return [...rows].sort(
    (a, b) => factor * (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]),
  );
}

export async function runIssueQuery(input: IssueQuery): Promise<{
  query: IssueQuery;
  groups: IssueGroup[];
  total: number;
}> {
  const query: IssueQuery = {
    ...DEFAULT_ISSUE_QUERY,
    ...input,
    filters: { ...input.filters },
  };

  // Deliberately column-scoped: `description` and other detail-only fields
  // never travel with list rows.
  const rows = await db
    .select({
      issue: {
        id: issues.id,
        identifierNumber: issues.identifierNumber,
        title: issues.title,
        priority: issues.priority,
        estimate: issues.estimate,
        dueDate: issues.dueDate,
        createdAt: issues.createdAt,
        updatedAt: issues.updatedAt,
        completedAt: issues.completedAt,
        archivedAt: issues.archivedAt,
        deletedAt: issues.deletedAt,
        version: issues.version,
        sortOrder: issues.sortOrder,
        parentIssueId: issues.parentIssueId,
        triageStatus: issues.triageStatus,
        triagedAt: issues.triagedAt,
        snoozedUntil: issues.snoozedUntil,
        triageSource: issues.triageSource,
        createdBy: issues.createdBy,
      },
      status: workflowStatuses,
      team: teams,
      assignee: members,
      project: projects,
      cycle: cycles,
    })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .innerJoin(teams, eq(issues.teamId, teams.id))
    .leftJoin(members, eq(issues.assigneeId, members.id))
    .leftJoin(projects, eq(issues.projectId, projects.id))
    .leftJoin(cycles, eq(issues.cycleId, cycles.id))
    .where(buildIssueWhere(query))
    .orderBy(...orderByClauses(query));

  const issueIds = rows.map((row) => row.issue.id);
  const labelRows = issueIds.length
    ? await db
        .select({ issueId: issueLabels.issueId, label: labels })
        .from(issueLabels)
        .innerJoin(labels, eq(issueLabels.labelId, labels.id))
        .where(inArray(issueLabels.issueId, issueIds))
    : [];

  // The creator matters in the triage queue (an agent filing an issue reads
  // very differently from a teammate), so it travels with the row.
  const creatorIds = [
    ...new Set(
      rows.map((row) => row.issue.createdBy).filter(Boolean) as string[],
    ),
  ];
  const creatorRows = creatorIds.length
    ? await db.select().from(members).where(inArray(members.id, creatorIds))
    : [];
  const creatorsById = new Map(
    creatorRows.map((member) => [
      member.id,
      {
        id: member.id,
        name: member.name,
        kind: member.kind,
        avatarUrl: member.avatarUrl,
      },
    ]),
  );

  const labelsByIssue = new Map<string, IssueListItem["labels"]>();
  for (const row of labelRows) {
    const list = labelsByIssue.get(row.issueId) ?? [];
    list.push({
      id: row.label.id,
      name: row.label.name,
      color: row.label.color,
    });
    labelsByIssue.set(row.issueId, list);
  }

  let items: IssueListItem[] = rows.map(
    ({ issue, status, team, assignee, project, cycle }) => ({
      id: issue.id,
      identifier: formatIdentifier(team.key, issue.identifierNumber),
      identifierNumber: issue.identifierNumber,
      title: issue.title,
      priority: issue.priority,
      estimate: issue.estimate,
      dueDate: iso(issue.dueDate),
      createdAt: iso(issue.createdAt)!,
      updatedAt: iso(issue.updatedAt)!,
      completedAt: iso(issue.completedAt),
      archivedAt: iso(issue.archivedAt),
      deletedAt: iso(issue.deletedAt),
      version: issue.version,
      sortOrder: issue.sortOrder,
      parentIssueId: issue.parentIssueId,
      triageStatus: issue.triageStatus,
      triagedAt: iso(issue.triagedAt),
      snoozedUntil: iso(issue.snoozedUntil),
      triageSource: issue.triageSource,
      creator: issue.createdBy
        ? (creatorsById.get(issue.createdBy) ?? null)
        : null,
      team: { id: team.id, key: team.key, name: team.name, color: team.color },
      status: {
        id: status.id,
        name: status.name,
        color: status.color,
        category: status.category,
        position: status.position,
      },
      assignee: assignee
        ? {
            id: assignee.id,
            name: assignee.name,
            kind: assignee.kind,
            avatarUrl: assignee.avatarUrl,
          }
        : null,
      project: project ? { id: project.id, name: project.name } : null,
      cycle: cycle
        ? { id: cycle.id, number: cycle.number, name: cycle.name }
        : null,
      labels: labelsByIssue.get(issue.id) ?? [],
    }),
  );

  items = applyPrioritySort(items, query);

  return { query, groups: await buildGroups(items, query), total: items.length };
}

/**
 * Reference-backed groupings keep their empty buckets so board columns stay
 * stable and droppable. A list has nothing to drop into, so empty groups are
 * pruned here rather than in the renderer.
 */
async function buildGroups(
  items: IssueListItem[],
  query: IssueQuery,
): Promise<IssueGroup[]> {
  const groups = await computeGroups(items, query);
  if (query.grouping === "none") return groups;
  if (query.layout === "board") return groups;
  return groups.filter((entry) => entry.issues.length > 0);
}

async function computeGroups(
  items: IssueListItem[],
  query: IssueQuery,
): Promise<IssueGroup[]> {
  const grouping: IssueGrouping = query.grouping;

  if (grouping === "none") {
    return [
      {
        key: "all",
        label: "All issues",
        color: null,
        count: items.length,
        issues: items,
      },
    ];
  }

  const buckets = new Map<string, IssueListItem[]>();
  const push = (key: string, issue: IssueListItem) => {
    const list = buckets.get(key) ?? [];
    list.push(issue);
    buckets.set(key, list);
  };

  for (const issue of items) {
    switch (grouping) {
      case "status":
        push(issue.status.id, issue);
        break;
      case "assignee":
        push(issue.assignee?.id ?? "unassigned", issue);
        break;
      case "priority":
        push(issue.priority, issue);
        break;
      case "project":
        push(issue.project?.id ?? "no-project", issue);
        break;
      case "cycle":
        push(issue.cycle?.id ?? "no-cycle", issue);
        break;
      case "label":
        if (issue.labels.length === 0) push("no-label", issue);
        else for (const label of issue.labels) push(label.id, issue);
        break;
    }
  }

  const group = (
    key: string,
    label: string,
    color: string | null,
  ): IssueGroup => ({
    key,
    label,
    color,
    count: buckets.get(key)?.length ?? 0,
    issues: buckets.get(key) ?? [],
  });

  if (grouping === "status") {
    const teamIds = query.filters.teamId?.length
      ? query.filters.teamId
      : [...new Set(items.map((issue) => issue.team.id))];
    const statuses = teamIds.length
      ? await db
          .select()
          .from(workflowStatuses)
          .where(inArray(workflowStatuses.teamId, teamIds))
          .orderBy(asc(workflowStatuses.position))
      : [];

    const seen = new Set<string>();
    const result: IssueGroup[] = [];
    for (const status of statuses) {
      if (seen.has(status.id)) continue;
      seen.add(status.id);
      result.push(group(status.id, status.name, status.color));
    }
    for (const [key, list] of buckets) {
      if (seen.has(key)) continue;
      result.push(group(key, list[0].status.name, list[0].status.color));
    }
    return result;
  }

  if (grouping === "priority") {
    return PRIORITY_ORDER.map((priority) =>
      group(priority, PRIORITY_LABEL[priority], null),
    );
  }

  if (grouping === "assignee" && !buckets.has("unassigned")) {
    buckets.set("unassigned", []);
  }

  const result: IssueGroup[] = [];
  for (const [key, list] of buckets) {
    const first = list[0];
    switch (grouping) {
      case "assignee":
        result.push(group(key, first?.assignee?.name ?? "Unassigned", null));
        break;
      case "project":
        result.push(group(key, first.project?.name ?? "No project", null));
        break;
      case "cycle":
        result.push(
          group(
            key,
            first.cycle
              ? first.cycle.name || `Cycle ${first.cycle.number}`
              : "No cycle",
            null,
          ),
        );
        break;
      case "label": {
        const label = first.labels.find((entry) => entry.id === key);
        result.push(
          group(key, label?.name ?? "No label", label?.color ?? null),
        );
        break;
      }
    }
  }
  result.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return result;
}
