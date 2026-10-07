import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { projectUpdates, projects } from "../drizzle/schema";
import { db } from "../server/db";
import {
  excerptOf,
  memberName,
  notifyMembers,
  projectFollowerIds,
} from "../server/notifications";
import { requireProject } from "../server/project-writes";
import { publishProjectChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";

import { projectHealthSchema } from "./create-project";

export default defineAction({
  description:
    "Post a project update. The update's health becomes the project's current health, so the project always reflects the most recent thing said about it. The author may be a human or an agent.",
  schema: z.object({
    projectId: z.string(),
    health: projectHealthSchema,
    body: z.string().min(1),
    authorId: z
      .string()
      .optional()
      .describe("Defaults to the current member; humans and agents both post"),
  }),
  http: { method: "POST" },
  run: async (args) => {
    const project = await requireProject(args.projectId);
    const actorId = args.authorId ?? (await getCurrentMemberId());

    const [created] = await db
      .insert(projectUpdates)
      .values({
        projectId: project.id,
        authorId: actorId,
        health: args.health,
        body: args.body,
      })
      .returning();

    await db
      .update(projects)
      .set({ health: args.health, updatedAt: new Date() })
      .where(eq(projects.id, project.id));

    await notifyMembers({
      recipientIds: await projectFollowerIds(project.id),
      type: "project_update",
      entityType: "project",
      entityId: project.id,
      actorId,
      metadata: {
        projectName: project.name,
        projectHealth: created.health,
        actorName: await memberName(actorId),
        excerpt: excerptOf(args.body),
      },
    });

    publishProjectChange(project.id);

    return { id: created.id, health: created.health };
  },
});
