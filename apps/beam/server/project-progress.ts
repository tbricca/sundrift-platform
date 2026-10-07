/**
 * Progress is always derived, never stored.
 *
 * completed non-canceled issues / all non-canceled issues
 *
 * Canceled work is excluded from both sides so abandoning an issue does not
 * quietly change the denominator into something misleading. Soft-deleted and
 * archived issues are excluded for the same reason.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

import { issues, workflowStatuses } from "../drizzle/schema";

import { db } from "./db";

export type Progress = {
  completed: number;
  total: number;
  /** Null when there is nothing to measure yet. */
  percent: number | null;
};

export const EMPTY_PROGRESS: Progress = {
  completed: 0,
  total: 0,
  percent: null,
};

function toProgress(completed: number, total: number): Progress {
  return {
    completed,
    total,
    percent: total === 0 ? null : Math.round((completed / total) * 100),
  };
}

async function countByGroup(
  groupColumn: AnyPgColumn,
  ids: string[],
): Promise<Map<string, Progress>> {
  const result = new Map<string, Progress>();
  if (ids.length === 0) return result;

  const rows = await db
    .select({
      key: groupColumn,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where ${workflowStatuses.category} = 'completed')::int`,
    })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .where(
      and(
        inArray(groupColumn, ids),
        isNull(issues.deletedAt),
        isNull(issues.archivedAt),
        ne(workflowStatuses.category, "canceled"),
      ),
    )
    .groupBy(groupColumn);

  for (const row of rows) {
    if (!row.key) continue;
    result.set(row.key, toProgress(row.completed, row.total));
  }
  return result;
}

export async function projectProgress(
  projectIds: string[],
): Promise<Map<string, Progress>> {
  return await countByGroup(issues.projectId, projectIds);
}

export async function milestoneProgress(
  milestoneIds: string[],
): Promise<Map<string, Progress>> {
  return await countByGroup(issues.milestoneId, milestoneIds);
}
