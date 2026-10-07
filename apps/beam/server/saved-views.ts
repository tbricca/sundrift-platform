/**
 * A saved view is just a persisted `IssueQuery`. The existing columns already
 * map one-to-one onto the descriptor (filters / grouping / ordering / layout /
 * visibleColumns), so nothing is stored twice and no migration was needed to
 * make views round-trip.
 */
import type { IssueQuery } from "../app/lib/issue-query";
import type { savedViews } from "../drizzle/schema";

import { issueQuerySchema } from "./issue-query-schema";

type SavedViewRow = typeof savedViews.$inferSelect;

export function rowToQuery(row: SavedViewRow): IssueQuery {
  return issueQuerySchema.parse({
    filters: row.filters ?? {},
    grouping: row.grouping ?? "status",
    ordering: row.ordering ?? undefined,
    layout: row.layout,
    visibleColumns: row.visibleColumns ?? undefined,
  }) as IssueQuery;
}

/** Validates an incoming descriptor and splits it across the view columns. */
export function queryToColumns(query: unknown) {
  const parsed = issueQuerySchema.parse(query);
  return {
    filters: parsed.filters as Record<string, unknown>,
    grouping: parsed.grouping,
    ordering: parsed.ordering as unknown[],
    layout: parsed.layout,
    visibleColumns: parsed.visibleColumns,
  };
}
