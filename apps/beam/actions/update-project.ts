import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { projects } from "../drizzle/schema";
import { db } from "../server/db";
import { prioritySchema } from "../server/issue-query-schema";
import { requireProject, setProjectTeams } from "../server/project-writes";
import { publishProjectChange } from "../server/realtime";

import {
  projectHealthSchema,
  projectStatusSchema,
} from "./create-project";

export default defineAction({
  description:
    "Update a project. Send only the fields that change. teamIds replaces the participating teams; a team that still has issues in the project cannot be removed.",
  schema: z.object({
    projectId: z.string(),
    name: z.string().min(1).optional(),
    summary: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    status: projectStatusSchema.optional(),
    priority: prioritySchema.optional(),
    leadId: z.string().nullable().optional(),
    health: projectHealthSchema.optional(),
    startDate: z.string().nullable().optional(),
    targetDate: z.string().nullable().optional(),
    teamIds: z.array(z.string()).optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const project = await requireProject(args.projectId);

    const patch: Record<string, unknown> = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.summary !== undefined) patch.summary = args.summary;
    if (args.description !== undefined) patch.description = args.description;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.leadId !== undefined) patch.leadId = args.leadId;
    if (args.health !== undefined) patch.health = args.health;
    if (args.startDate !== undefined) {
      patch.startDate = args.startDate ? new Date(args.startDate) : null;
    }
    if (args.targetDate !== undefined) {
      patch.targetDate = args.targetDate ? new Date(args.targetDate) : null;
    }
    if (args.status !== undefined) {
      patch.status = args.status;
      // Completion is derived from status; issues are never touched.
      patch.completedAt =
        args.status === "completed" ? (project.completedAt ?? new Date()) : null;
    }

    if (Object.keys(patch).length) {
      patch.updatedAt = new Date();
      await db.update(projects).set(patch).where(eq(projects.id, project.id));
    }

    if (args.teamIds) await setProjectTeams(project.id, args.teamIds);

    publishProjectChange(project.id);

    return { id: project.id, updated: true };
  },
});
