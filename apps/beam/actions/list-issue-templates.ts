import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { templateSummary } from "../app/lib/issue-template";
import { issueTemplateLabels, issueTemplates } from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Issue templates for a team: reusable sets of defaults (title, description, status, priority, assignee, labels, project, cycle, estimate, due-date offset) that create-issue can apply through its templateId argument. Archived templates are hidden unless includeArchived is set.",
  schema: z.object({
    teamId: z.string().optional().describe("Only this team's templates."),
    includeArchived: z.boolean().optional(),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return { templates: [] };

    const rows = await db
      .select()
      .from(issueTemplates)
      .where(
        and(
          eq(issueTemplates.workspaceId, workspace.id),
          args.teamId ? eq(issueTemplates.teamId, args.teamId) : undefined,
          args.includeArchived ? undefined : isNull(issueTemplates.archivedAt),
        ),
      )
      .orderBy(asc(issueTemplates.name));

    const labelRows = rows.length
      ? await db
          .select()
          .from(issueTemplateLabels)
          .where(
            inArray(
              issueTemplateLabels.templateId,
              rows.map((row) => row.id),
            ),
          )
      : [];

    const labelsByTemplate = new Map<string, string[]>();
    for (const row of labelRows) {
      labelsByTemplate.set(row.templateId, [
        ...(labelsByTemplate.get(row.templateId) ?? []),
        row.labelId,
      ]);
    }

    return {
      templates: rows.map((row) => {
        const labelIds = labelsByTemplate.get(row.id) ?? [];
        return {
          id: row.id,
          teamId: row.teamId,
          name: row.name,
          description: row.description,
          titleTemplate: row.titleTemplate,
          issueDescription: row.issueDescription,
          priority: row.priority,
          statusId: row.statusId,
          assigneeId: row.assigneeId,
          projectId: row.projectId,
          cycleId: row.cycleId,
          milestoneId: row.milestoneId,
          estimate: row.estimate,
          dueDateOffsetDays: row.dueDateOffsetDays,
          labelIds,
          archivedAt: iso(row.archivedAt),
          createdAt: iso(row.createdAt)!,
          // Rendered by the settings list; derived here so the client and any
          // agent reading this action see the same one-line summary.
          summary: templateSummary({ ...row, labelIds }),
        };
      }),
    };
  },
});
