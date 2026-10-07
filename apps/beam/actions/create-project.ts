import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { projects } from "../drizzle/schema";
import { db } from "../server/db";
import { prioritySchema } from "../server/issue-query-schema";
import { UserError } from "../server/issue-writes";
import { setProjectTeams } from "../server/project-writes";
import { getWorkspace } from "../server/workspace";

export const projectStatusSchema = z.enum([
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
]);

export const projectHealthSchema = z.enum([
  "no_update",
  "on_track",
  "at_risk",
  "off_track",
]);

export default defineAction({
  description:
    "Create a project. The lead can be any member, human or agent. Teams are the teams participating in the project.",
  schema: z.object({
    name: z.string().min(1),
    summary: z.string().optional(),
    description: z.string().optional(),
    status: projectStatusSchema.optional(),
    priority: prioritySchema.optional(),
    leadId: z.string().nullable().optional(),
    health: projectHealthSchema.optional(),
    startDate: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    teamIds: z.array(z.string()).optional(),
  }),
  http: { method: "POST" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace found.", 404);

    const [created] = await db
      .insert(projects)
      .values({
        workspaceId: workspace.id,
        name: args.name.trim(),
        summary: args.summary ?? null,
        description: args.description ?? null,
        status: args.status ?? "planned",
        priority: args.priority ?? "none",
        leadId: args.leadId ?? null,
        health: args.health ?? "no_update",
        startDate: args.startDate ? new Date(args.startDate) : null,
        targetDate: args.targetDate ? new Date(args.targetDate) : null,
      })
      .returning();

    if (args.teamIds?.length) {
      await setProjectTeams(created.id, args.teamIds);
    }

    return { id: created.id, name: created.name };
  },
});
