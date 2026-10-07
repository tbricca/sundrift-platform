/**
 * Global workspace search.
 *
 * Deliberately separate from `issue-engine.ts`: that engine answers "what
 * belongs in this view" and hides unresolved triage by design, while search
 * answers "where is this thing" and must be able to find it. The two share
 * nothing but the tables.
 *
 * Shape of every lookup: a wide-but-bounded SQL net, then `search-rank.ts`
 * decides the order. Only the columns a result row renders are selected.
 */
import { and, eq, exists, ilike, inArray, isNull, or, sql } from "drizzle-orm";

import { cycleState } from "../app/lib/cycle";
import type { WorkspaceSearchResults } from "../app/lib/types";
import {
  comments,
  cycles,
  issues,
  members,
  projectTeams,
  projects,
  savedViews,
  teams,
  workflowStatuses,
} from "../drizzle/schema";
import { db } from "./db";
import { iso } from "./issue-engine";
import {
  MIN_COMMENT_QUERY,
  MIN_TEXT_QUERY,
  normalize,
  parseIdentifierQuery,
  rankBy,
  scoreIssue,
  scoreText,
} from "./search-rank";

export const SEARCH_LIMITS = {
  issues: 8,
  projects: 5,
  cycles: 3,
  views: 5,
  members: 4,
} as const;

export type SearchLimits = Partial<Record<keyof typeof SEARCH_LIMITS, number>>;

/** Candidates pulled per entity before ranking trims to the display limit. */
const CANDIDATE_FACTOR = 5;

function like(value: string): string {
  // Escape LIKE wildcards so a query of "100%" is not a match-everything.
  return `%${value.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

const EMPTY: WorkspaceSearchResults = {
  query: "",
  issues: [],
  projects: [],
  cycles: [],
  views: [],
  members: [],
};

export async function searchWorkspace(
  workspaceId: string,
  rawQuery: string,
  limits: SearchLimits = {},
): Promise<WorkspaceSearchResults> {
  const query = normalize(rawQuery);
  if (!query) return EMPTY;

  const take = { ...SEARCH_LIMITS, ...limits };

  const [issueRows, projectRows, cycleRows, viewRows, memberRows] =
    await Promise.all([
      searchIssues(workspaceId, query, take.issues * CANDIDATE_FACTOR),
      searchProjects(workspaceId, query, take.projects * CANDIDATE_FACTOR),
      searchCycles(workspaceId, query, take.cycles * CANDIDATE_FACTOR),
      searchViews(workspaceId, query, take.views * CANDIDATE_FACTOR),
      searchMembers(query, take.members * CANDIDATE_FACTOR),
    ]);

  return {
    query,
    issues: rankBy(
      issueRows,
      (issue) => scoreIssue(issue, query),
      (issue) => issue.updatedAt,
    ).slice(0, take.issues),
    projects: rankBy(
      projectRows,
      (project) =>
        scoreText(project.name, query) || summaryScore(project, query),
    ).slice(0, take.projects),
    cycles: rankBy(cycleRows, (cycle) => cycle.score).slice(0, take.cycles),
    views: rankBy(viewRows, (view) => scoreText(view.name, query)).slice(
      0,
      take.views,
    ),
    members: rankBy(
      memberRows,
      (member) =>
        scoreText(member.name, query) || scoreText(member.email, query),
    ).slice(0, take.members),
  };
}

function summaryScore(
  project: { summary: string | null; description: string | null },
  query: string,
): number {
  // Body matches all rank the same; the name is what distinguishes projects.
  return scoreText(project.summary, query) ||
    scoreText(project.description, query)
    ? 100
    : 0;
}

async function searchIssues(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<WorkspaceSearchResults["issues"]> {
  const identifier = parseIdentifierQuery(query);
  const pattern = like(query);
  const wide = query.length >= MIN_TEXT_QUERY;

  const matchers = [
    // A bare number matches the number in any team; `ENG-42` pins the team.
    // The prefix arm is what makes `ENG-1` also offer ENG-14 and ENG-19.
    identifier
      ? and(
          identifier.teamKey
            ? or(
                eq(issues.identifierNumber, identifier.number),
                sql`${issues.identifierNumber}::text like ${`${identifier.number}%`}`,
              )
            : eq(issues.identifierNumber, identifier.number),
          identifier.teamKey ? eq(teams.key, identifier.teamKey) : undefined,
        )
      : undefined,
    wide ? ilike(issues.title, pattern) : ilike(issues.title, `${query}%`),
    wide ? ilike(issues.description, pattern) : undefined,
  ].filter(Boolean);

  const commentMatch =
    query.length >= MIN_COMMENT_QUERY
      ? exists(
          db
            .select({ one: sql`1` })
            .from(comments)
            .where(
              and(
                eq(comments.issueId, issues.id),
                isNull(comments.deletedAt),
                ilike(comments.body, pattern),
              ),
            ),
        )
      : undefined;

  const rows = await db
    .select({
      id: issues.id,
      identifierNumber: issues.identifierNumber,
      title: issues.title,
      description: issues.description,
      updatedAt: issues.updatedAt,
      archivedAt: issues.archivedAt,
      triageStatus: issues.triageStatus,
      teamKey: teams.key,
      teamName: teams.name,
      teamColor: teams.color,
      statusName: workflowStatuses.name,
      statusColor: workflowStatuses.color,
      statusCategory: workflowStatuses.category,
      assigneeName: members.name,
      assigneeAvatarUrl: members.avatarUrl,
      assigneeKind: members.kind,
      commentMatched: commentMatch
        ? sql<boolean>`coalesce(${commentMatch}, false)`
        : sql<boolean>`false`,
    })
    .from(issues)
    .innerJoin(teams, eq(teams.id, issues.teamId))
    .innerJoin(workflowStatuses, eq(workflowStatuses.id, issues.statusId))
    .leftJoin(members, eq(members.id, issues.assigneeId))
    .where(
      and(
        eq(teams.workspaceId, workspaceId),
        // Soft-deleted issues are gone as far as search is concerned.
        // Archived, completed and canceled ones are still findable.
        isNull(issues.deletedAt),
        or(...matchers, commentMatch),
      ),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    identifier: `${row.teamKey}-${row.identifierNumber}`,
    title: row.title,
    description: row.description,
    updatedAt: iso(row.updatedAt),
    archived: Boolean(row.archivedAt),
    triageStatus: row.triageStatus,
    commentMatched: Boolean(row.commentMatched),
    team: { key: row.teamKey, name: row.teamName, color: row.teamColor },
    status: {
      name: row.statusName,
      color: row.statusColor,
      category: row.statusCategory,
    },
    assignee: row.assigneeName
      ? {
          name: row.assigneeName,
          avatarUrl: row.assigneeAvatarUrl,
          kind: row.assigneeKind!,
        }
      : null,
  }));
}

async function searchProjects(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<WorkspaceSearchResults["projects"]> {
  const pattern = like(query);
  const wide = query.length >= MIN_TEXT_QUERY;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      summary: projects.summary,
      description: projects.description,
      status: projects.status,
      health: projects.health,
      targetDate: projects.targetDate,
    })
    .from(projects)
    .where(
      and(
        eq(projects.workspaceId, workspaceId),
        wide
          ? or(
              ilike(projects.name, pattern),
              ilike(projects.summary, pattern),
              ilike(projects.description, pattern),
            )
          : ilike(projects.name, `${query}%`),
      ),
    )
    .limit(limit);

  if (rows.length === 0) return [];

  // One grouped join rather than a team lookup per project.
  const teamRows = await db
    .select({
      projectId: projectTeams.projectId,
      key: teams.key,
    })
    .from(projectTeams)
    .innerJoin(teams, eq(teams.id, projectTeams.teamId))
    .where(
      inArray(
        projectTeams.projectId,
        rows.map((row) => row.id),
      ),
    );

  const keysByProject = new Map<string, string[]>();
  for (const row of teamRows) {
    keysByProject.set(row.projectId, [
      ...(keysByProject.get(row.projectId) ?? []),
      row.key,
    ]);
  }

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    summary: row.summary,
    description: row.description,
    status: row.status,
    health: row.health,
    targetDate: iso(row.targetDate),
    teamKeys: keysByProject.get(row.id) ?? [],
  }));
}

async function searchCycles(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<(WorkspaceSearchResults["cycles"][number] & { score: number })[]> {
  const pattern = like(query);
  // `ENG 14`, `cycle 14` and `14` all reduce to a number plus optional words.
  const number = /(\d{1,6})/.exec(query)?.[1];
  const words = query
    .replace(/\bcycle\b/g, "")
    .replace(/\d+/g, "")
    .trim();

  const rows = await db
    .select({
      id: cycles.id,
      number: cycles.number,
      name: cycles.name,
      startsAt: cycles.startsAt,
      endsAt: cycles.endsAt,
      teamKey: teams.key,
      teamName: teams.name,
    })
    .from(cycles)
    .innerJoin(teams, eq(teams.id, cycles.teamId))
    .where(
      and(
        eq(teams.workspaceId, workspaceId),
        or(
          number ? eq(cycles.number, Number(number)) : undefined,
          ilike(cycles.name, pattern),
          words.length >= MIN_TEXT_QUERY
            ? or(ilike(teams.key, `${words}%`), ilike(teams.name, like(words)))
            : undefined,
        ),
      ),
    )
    .limit(limit);

  return rows.map((row) => {
    const teamHit =
      words.length >= MIN_TEXT_QUERY
        ? scoreText(row.teamKey, words) || scoreText(row.teamName, words)
        : 0;
    const numberHit = number && row.number === Number(number) ? 400 : 0;
    const nameHit = scoreText(row.name, query);
    return {
      id: row.id,
      number: row.number,
      name: row.name,
      startsAt: iso(row.startsAt)!,
      endsAt: iso(row.endsAt)!,
      state: cycleState({ startsAt: row.startsAt, endsAt: row.endsAt }),
      team: { key: row.teamKey, name: row.teamName },
      // A team hit alone is weak; a team plus the right number is the answer.
      score: numberHit + teamHit + nameHit,
    };
  });
}

async function searchViews(
  workspaceId: string,
  query: string,
  limit: number,
): Promise<WorkspaceSearchResults["views"]> {
  const wide = query.length >= MIN_TEXT_QUERY;
  const rows = await db
    .select({
      id: savedViews.id,
      name: savedViews.name,
      layout: savedViews.layout,
      teamKey: teams.key,
    })
    .from(savedViews)
    .leftJoin(teams, eq(teams.id, savedViews.teamId))
    .where(
      and(
        eq(savedViews.workspaceId, workspaceId),
        // Filter values are never searched — the name is the handle people use.
        wide
          ? ilike(savedViews.name, like(query))
          : ilike(savedViews.name, `${query}%`),
      ),
    )
    .limit(limit);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    layout: row.layout,
    teamKey: row.teamKey,
  }));
}

async function searchMembers(
  query: string,
  limit: number,
): Promise<WorkspaceSearchResults["members"]> {
  const wide = query.length >= MIN_TEXT_QUERY;
  const rows = await db
    .select({
      id: members.id,
      name: members.name,
      email: members.email,
      kind: members.kind,
      avatarUrl: members.avatarUrl,
    })
    .from(members)
    .where(
      wide
        ? or(
            ilike(members.name, like(query)),
            ilike(members.email, like(query)),
          )
        : ilike(members.name, `${query}%`),
    )
    .limit(limit);

  return rows;
}
