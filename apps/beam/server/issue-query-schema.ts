import { z } from "zod";

import {
  DEFAULT_VISIBLE_COLUMNS,
  type IssueQuery,
} from "../app/lib/issue-query";

export const statusCategorySchema = z.enum([
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
]);

export const prioritySchema = z.enum([
  "none",
  "low",
  "medium",
  "high",
  "urgent",
]);

export const groupingSchema = z.enum([
  "status",
  "assignee",
  "priority",
  "project",
  "cycle",
  "label",
  "none",
]);

const nullableIds = z.array(z.string().nullable());

export const issueExclusionsSchema = z.object({
  teamId: z.array(z.string()).optional(),
  statusId: z.array(z.string()).optional(),
  statusCategory: z.array(statusCategorySchema).optional(),
  assigneeId: nullableIds.optional(),
  priority: z.array(prioritySchema).optional(),
  labelId: z.array(z.string()).optional(),
  projectId: nullableIds.optional(),
  cycleId: nullableIds.optional(),
  milestoneId: nullableIds.optional(),
  creatorId: z.array(z.string()).optional(),
});

export const issueFiltersSchema = z.object({
  teamId: z.array(z.string()).optional(),
  statusId: z.array(z.string()).optional(),
  statusCategory: z.array(statusCategorySchema).optional(),
  assigneeId: nullableIds.optional().describe("null matches unassigned issues"),
  priority: z.array(prioritySchema).optional(),
  labelId: z.array(z.string()).optional(),
  projectId: nullableIds.optional(),
  cycleId: nullableIds.optional(),
  milestoneId: nullableIds.optional(),
  creatorId: z.array(z.string()).optional(),
  parentIssueId: z.string().nullable().optional(),
  search: z.string().optional(),
  includeArchived: z.boolean().optional(),
  includeDeleted: z
    .boolean()
    .optional()
    .describe("Internal/admin only. User-facing views never set this."),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  dueSet: z
    .boolean()
    .optional()
    .describe("true matches issues with a due date, false matches issues without"),
  createdBefore: z.string().optional(),
  createdAfter: z.string().optional(),
  updatedBefore: z.string().optional(),
  updatedAfter: z.string().optional(),
  issueId: z.array(z.string()).optional(),
  triage: z
    .enum(["pending", "snoozed", "accepted", "declined", "any"])
    .optional()
    .describe(
      "Triage scope. Omit it and the query hides issues still awaiting review, which is what every normal view wants.",
    ),
  exclude: issueExclusionsSchema
    .optional()
    .describe(
      "Negated matches, ANDed as NOT(...). Backs the 'is not' and 'excludes' operators.",
    ),
});

export const issueOrderingSchema = z.object({
  field: z.enum([
    "manual",
    "priority",
    "updatedAt",
    "createdAt",
    "dueDate",
    "title",
  ]),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

export const issueQuerySchema = z.object({
  filters: issueFiltersSchema.default({}),
  grouping: groupingSchema.default("status"),
  ordering: z
    .array(issueOrderingSchema)
    .default([{ field: "manual", direction: "asc" }]),
  layout: z.enum(["list", "board"]).default("list"),
  visibleColumns: z.array(z.string()).default(DEFAULT_VISIBLE_COLUMNS),
});

export type IssueQueryInput = z.infer<typeof issueQuerySchema>;

export function toIssueQuery(input: IssueQueryInput): IssueQuery {
  return input as IssueQuery;
}
