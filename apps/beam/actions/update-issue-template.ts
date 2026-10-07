import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { issueTemplates } from "../drizzle/schema";
import { db } from "../server/db";
import {
  requireTemplate,
  setTemplateLabels,
  validateTemplateRefs,
} from "../server/issue-templates";
import { templateFieldsSchema } from "./create-issue-template";
import { publishTemplateChange } from "../server/realtime";

const optional = { ...templateFieldsSchema, name: z.string().min(1).optional() };

export default defineAction({
  description:
    "Update an issue template, or archive it. Archiving hides it from the create-issue selector while keeping issues that were made from it untouched. Pass archived: false to bring it back.",
  schema: z.object({
    id: z.string(),
    ...optional,
    archived: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const template = await requireTemplate(args.id);

    // A template never changes teams: its references are validated against one
    // team, and moving it would invalidate all of them at once.
    const projectId =
      args.projectId !== undefined ? args.projectId : template.projectId;
    await validateTemplateRefs(
      template.teamId,
      {
        statusId: args.statusId,
        assigneeId: args.assigneeId,
        projectId: args.projectId,
        cycleId: args.cycleId,
        milestoneId: args.milestoneId,
        labelIds: args.labelIds,
      },
      projectId,
    );

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (args.name !== undefined) patch.name = args.name.trim();
    for (const field of [
      "description",
      "titleTemplate",
      "issueDescription",
      "priority",
      "statusId",
      "assigneeId",
      "cycleId",
      "milestoneId",
      "estimate",
      "dueDateOffsetDays",
    ] as const) {
      if (args[field] !== undefined) patch[field] = args[field];
    }

    if (args.projectId !== undefined) {
      patch.projectId = args.projectId;
      // The milestone belongs to the old project, so it cannot survive the
      // move — the same rule `update-issue` applies to an issue.
      if (args.projectId !== template.projectId && args.milestoneId === undefined) {
        patch.milestoneId = null;
      }
    }

    if (args.archived !== undefined) {
      patch.archivedAt = args.archived ? new Date() : null;
    }

    const [updated] = await db
      .update(issueTemplates)
      .set(patch)
      .where(eq(issueTemplates.id, template.id))
      .returning();

    if (args.labelIds !== undefined) {
      await setTemplateLabels(template.id, args.labelIds);
    }

    publishTemplateChange(template.id, template.teamId);

    return { id: updated.id, archived: updated.archivedAt !== null };
  },
});
