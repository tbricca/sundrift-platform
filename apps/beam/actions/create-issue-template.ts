import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { issueTemplates, teams } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import {
  setTemplateLabels,
  validateTemplateRefs,
} from "../server/issue-templates";
import { prioritySchema } from "../server/issue-query-schema";
import { publishTemplateChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";

export const templateFieldsSchema = {
  name: z.string().min(1).describe("What the template is called."),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("One line explaining when to use it."),
  titleTemplate: z
    .string()
    .nullable()
    .optional()
    .describe("Default issue title; the author can still edit it."),
  issueDescription: z
    .string()
    .nullable()
    .optional()
    .describe("Default issue body. Mentions are stored as member ids."),
  priority: prioritySchema.nullable().optional(),
  statusId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  projectId: z.string().nullable().optional(),
  cycleId: z.string().nullable().optional(),
  milestoneId: z.string().nullable().optional(),
  estimate: z.coerce.number().int().nullable().optional(),
  dueDateOffsetDays: z.coerce
    .number()
    .int()
    .nullable()
    .optional()
    .describe("Due this many days after the issue is created."),
  labelIds: z.array(z.string()).optional(),
};

export default defineAction({
  description:
    "Create a reusable issue template for a team. Every default is optional. References must belong to the template's team, the same rule create-issue applies.",
  schema: z.object({
    teamId: z.string().describe("Team the template belongs to."),
    ...templateFieldsSchema,
  }),
  http: { method: "POST" },
  run: async (args) => {
    const [team] = await db
      .select()
      .from(teams)
      .where(eq(teams.id, args.teamId))
      .limit(1);
    if (!team) throw new UserError(`Team not found: ${args.teamId}`, 404);

    await validateTemplateRefs(team.id, args, args.projectId ?? null);

    const [created] = await db
      .insert(issueTemplates)
      .values({
        workspaceId: team.workspaceId,
        teamId: team.id,
        name: args.name.trim(),
        description: args.description ?? null,
        titleTemplate: args.titleTemplate ?? null,
        issueDescription: args.issueDescription ?? null,
        priority: args.priority ?? null,
        statusId: args.statusId ?? null,
        assigneeId: args.assigneeId ?? null,
        projectId: args.projectId ?? null,
        cycleId: args.cycleId ?? null,
        milestoneId: args.milestoneId ?? null,
        estimate: args.estimate ?? null,
        dueDateOffsetDays: args.dueDateOffsetDays ?? null,
        createdBy: await getCurrentMemberId(),
      })
      .returning();

    if (args.labelIds?.length) {
      await setTemplateLabels(created.id, args.labelIds);
    }

    publishTemplateChange(created.id, team.id);

    return { id: created.id, name: created.name };
  },
});
