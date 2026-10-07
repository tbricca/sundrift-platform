import { and, eq, inArray, isNull } from "drizzle-orm";

import { parseIdentifier } from "../app/lib/issue-query";
import {
  cycles,
  issues,
  labels,
  members,
  milestones,
  projects,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

import { db } from "./db";

export type Ref = { id: string | null; name: string } | null;

/**
 * Soft-deleted issues are invisible to ordinary writes. Only the restore path
 * and deleted-aware reads pass `includeDeleted`, so nothing else can quietly
 * parent to, relate to or mutate an issue the user already threw away.
 */
export type ResolveOptions = { includeDeleted?: boolean };

export async function resolveIssue(
  ref: string,
  { includeDeleted = false }: ResolveOptions = {},
) {
  const visible = includeDeleted ? undefined : isNull(issues.deletedAt);
  const parsed = parseIdentifier(ref);
  if (parsed) {
    const [row] = await db
      .select({ issue: issues })
      .from(issues)
      .innerJoin(teams, eq(issues.teamId, teams.id))
      .where(
        and(
          eq(teams.key, parsed.teamKey),
          eq(issues.identifierNumber, parsed.number),
          visible,
        ),
      )
      .limit(1);
    if (row) return row.issue;
  }
  const [byId] = await db
    .select()
    .from(issues)
    .where(and(eq(issues.id, ref), visible))
    .limit(1);
  return byId ?? null;
}

export async function requireIssue(ref: string, options: ResolveOptions = {}) {
  const issue = await resolveIssue(ref, options);
  if (!issue) throw new UserError(`Issue not found: ${ref}`, 404);
  return issue;
}

/**
 * The two guards every issue write goes through, in one place so they can be
 * reasoned about (and tested) without a database.
 *
 * `reject` is a message when the write must not happen at all. `guardVersion`
 * says whether the UPDATE has to carry `AND version = expected`, which is what
 * makes optimistic concurrency actually atomic rather than advisory.
 */
export type IssueWritePolicy = {
  reject: string | null;
  guardVersion: boolean;
};

export function issueWritePolicy(
  issue: { deletedAt: Date | string | null },
  args: { deleted?: boolean; expectedVersion?: number },
): IssueWritePolicy {
  // A deleted issue accepts exactly one edit: the one that brings it back.
  const reject =
    issue.deletedAt && args.deleted !== false
      ? "This issue is deleted. Restore it before editing."
      : null;

  return { reject, guardVersion: args.expectedVersion !== undefined };
}

/**
 * True when a guarded UPDATE matched nothing, which can only mean another
 * writer changed the version between the read and the write.
 */
export function lostVersionRace(
  rowsWritten: number,
  policy: IssueWritePolicy,
): boolean {
  return policy.guardVersion && rowsWritten === 0;
}

/**
 * Walks parent links upward. Used to reject circular parenting and to tell the
 * UI which issues are not valid parents.
 */
export async function ancestorIds(issueId: string): Promise<string[]> {
  const seen: string[] = [];
  let currentId: string | null = issueId;

  while (currentId) {
    const rows = (await db
      .select({ parentIssueId: issues.parentIssueId })
      .from(issues)
      .where(eq(issues.id, currentId))
      .limit(1)) as { parentIssueId: string | null }[];
    const parentId: string | null = rows[0]?.parentIssueId ?? null;
    if (!parentId || seen.includes(parentId)) break;
    seen.push(parentId);
    currentId = parentId;
  }
  return seen;
}

async function nameFor(
  table: "status" | "member" | "project" | "cycle" | "milestone",
  id: string | null,
): Promise<Ref> {
  if (!id) return null;
  switch (table) {
    case "status": {
      const [row] = await db
        .select({ id: workflowStatuses.id, name: workflowStatuses.name })
        .from(workflowStatuses)
        .where(eq(workflowStatuses.id, id))
        .limit(1);
      return row ?? null;
    }
    case "member": {
      const [row] = await db
        .select({ id: members.id, name: members.name })
        .from(members)
        .where(eq(members.id, id))
        .limit(1);
      return row ?? null;
    }
    case "project": {
      const [row] = await db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.id, id))
        .limit(1);
      return row ?? null;
    }
    case "cycle": {
      const [row] = await db
        .select({ id: cycles.id, name: cycles.name, number: cycles.number })
        .from(cycles)
        .where(eq(cycles.id, id))
        .limit(1);
      return row
        ? { id: row.id, name: row.name || `Cycle ${row.number}` }
        : null;
    }
    case "milestone": {
      const [row] = await db
        .select({ id: milestones.id, name: milestones.name })
        .from(milestones)
        .where(eq(milestones.id, id))
        .limit(1);
      return row ?? null;
    }
  }
}

export const refFor = nameFor;

/** Null when the milestone does not exist. */
export async function milestoneProjectId(
  milestoneId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ projectId: milestones.projectId })
    .from(milestones)
    .where(eq(milestones.id, milestoneId))
    .limit(1);
  return row?.projectId ?? null;
}

export async function issueRef(id: string | null): Promise<Ref> {
  if (!id) return null;
  const [row] = await db
    .select({ id: issues.id, number: issues.identifierNumber, key: teams.key })
    .from(issues)
    .innerJoin(teams, eq(issues.teamId, teams.id))
    .where(eq(issues.id, id))
    .limit(1);
  return row ? { id: row.id, name: `${row.key}-${row.number}` } : null;
}

export async function labelRefs(
  ids: string[],
): Promise<{ id: string; name: string }[]> {
  if (!ids.length) return [];
  return await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(inArray(labels.id, ids));
}

/**
 * Relations are stored once. `blocked_by` is flipped into a `blocks` row in the
 * opposite direction, and the symmetric kinds get a stable id ordering, so an
 * inverse duplicate can never be inserted.
 */
export function canonicalRelation(
  issueId: string,
  relatedIssueId: string,
  type: "blocks" | "blocked_by" | "related" | "duplicate",
): {
  issueId: string;
  relatedIssueId: string;
  type: "blocks" | "related" | "duplicate";
} {
  if (type === "blocked_by") {
    return { issueId: relatedIssueId, relatedIssueId: issueId, type: "blocks" };
  }
  if (type === "related" || type === "duplicate") {
    const [first, second] =
      issueId < relatedIssueId
        ? [issueId, relatedIssueId]
        : [relatedIssueId, issueId];
    return { issueId: first, relatedIssueId: second, type };
  }
  return { issueId, relatedIssueId, type: "blocks" };
}

/**
 * The action layer only echoes a thrown message to HTTP callers when the error
 * carries a sub-500 `statusCode`, so user-correctable problems set one.
 */
export class UserError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "UserError";
    this.statusCode = statusCode;
  }
}

export class ConflictError extends UserError {
  readonly currentVersion: number;

  constructor(currentVersion: number) {
    super(
      "This issue was changed by someone else. Reload to see the latest version.",
      409,
    );
    this.name = "ConflictError";
    this.currentVersion = currentVersion;
  }
}
