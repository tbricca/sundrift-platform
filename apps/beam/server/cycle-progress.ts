/**
 * Cycle metrics are counted in SQL, never stored and never derived by loading
 * every issue: one grouped query answers the whole cycles page.
 *
 * Canceled, soft-deleted and archived issues are excluded from both sides of
 * the ratio, matching how project progress is computed.
 */
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { issues, workflowStatuses } from "../drizzle/schema";

import { db } from "./db";
import type { Progress } from "./project-progress";

export type CycleMetrics = Progress & {
  /** Null when no issue in the cycle carries an estimate. */
  estimate: { completed: number; total: number } | null;
};

export const EMPTY_CYCLE_METRICS: CycleMetrics = {
  completed: 0,
  total: 0,
  percent: null,
  estimate: null,
};

export async function cycleMetrics(
  cycleIds: string[],
): Promise<Map<string, CycleMetrics>> {
  const result = new Map<string, CycleMetrics>();
  if (cycleIds.length === 0) return result;

  const completedFilter = sql`filter (where ${workflowStatuses.category} = 'completed')`;

  const rows = await db
    .select({
      cycleId: issues.cycleId,
      total: sql<number>`count(*)::int`,
      completed: sql<number>`(count(*) ${completedFilter})::int`,
      estimateTotal: sql<number>`coalesce(sum(${issues.estimate}), 0)::int`,
      estimateCompleted: sql<number>`coalesce(sum(${issues.estimate}) ${completedFilter}, 0)::int`,
      estimated: sql<number>`(count(${issues.estimate}))::int`,
    })
    .from(issues)
    .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
    .where(
      and(
        inArray(issues.cycleId, cycleIds),
        isNull(issues.deletedAt),
        isNull(issues.archivedAt),
        ne(workflowStatuses.category, "canceled"),
      ),
    )
    .groupBy(issues.cycleId);

  for (const row of rows) {
    if (!row.cycleId) continue;
    result.set(row.cycleId, {
      completed: row.completed,
      total: row.total,
      percent:
        row.total === 0 ? null : Math.round((row.completed / row.total) * 100),
      estimate:
        row.estimated > 0
          ? { completed: row.estimateCompleted, total: row.estimateTotal }
          : null,
    });
  }
  return result;
}
