import { defineAction } from "@agent-native/core/action";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  favorites,
  members,
  milestones,
  projectTeams,
  projectUpdates,
  projects,
  teams,
} from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { UserError } from "../server/issue-writes";
import {
  EMPTY_PROGRESS,
  milestoneProgress,
  projectProgress,
} from "../server/project-progress";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description:
    "Read one project: properties, participating teams, milestones with computed progress, and project updates newest-first.",
  schema: z.object({ projectId: z.string() }),
  http: { method: "GET" },
  run: async (args) => {
    const [row] = await db
      .select({ project: projects, lead: members })
      .from(projects)
      .leftJoin(members, eq(projects.leadId, members.id))
      .where(eq(projects.id, args.projectId))
      .limit(1);
    if (!row) throw new UserError(`Project not found: ${args.projectId}`, 404);

    const currentMemberId = await getCurrentMemberId();

    const [teamRows, milestoneRows, updateRows, progress] = await Promise.all([
      db
        .select({ team: teams })
        .from(projectTeams)
        .innerJoin(teams, eq(projectTeams.teamId, teams.id))
        .where(eq(projectTeams.projectId, row.project.id)),
      db
        .select()
        .from(milestones)
        .where(eq(milestones.projectId, row.project.id))
        .orderBy(asc(milestones.sortOrder)),
      db
        .select({ update: projectUpdates, author: members })
        .from(projectUpdates)
        .leftJoin(members, eq(projectUpdates.authorId, members.id))
        .where(eq(projectUpdates.projectId, row.project.id))
        .orderBy(desc(projectUpdates.createdAt)),
      projectProgress([row.project.id]),
    ]);

    const milestoneStats = await milestoneProgress(
      milestoneRows.map((milestone) => milestone.id),
    );

    const [favorite] = currentMemberId
      ? await db
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, currentMemberId),
              eq(favorites.entityType, "project"),
              eq(favorites.entityId, row.project.id),
            ),
          )
          .limit(1)
      : [];

    return {
      id: row.project.id,
      name: row.project.name,
      summary: row.project.summary,
      description: row.project.description,
      status: row.project.status,
      priority: row.project.priority,
      health: row.project.health,
      lead: row.lead
        ? {
            id: row.lead.id,
            name: row.lead.name,
            kind: row.lead.kind,
            avatarUrl: row.lead.avatarUrl,
          }
        : null,
      startDate: iso(row.project.startDate),
      targetDate: iso(row.project.targetDate),
      createdAt: iso(row.project.createdAt),
      updatedAt: iso(row.project.updatedAt),
      completedAt: iso(row.project.completedAt),
      isFavorite: Boolean(favorite),
      progress: progress.get(row.project.id) ?? EMPTY_PROGRESS,
      teams: teamRows.map(({ team }) => ({
        id: team.id,
        key: team.key,
        name: team.name,
        color: team.color,
      })),
      milestones: milestoneRows.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
        description: milestone.description,
        targetDate: iso(milestone.targetDate),
        sortOrder: milestone.sortOrder,
        progress: milestoneStats.get(milestone.id) ?? EMPTY_PROGRESS,
      })),
      updates: updateRows.map(({ update, author }) => ({
        id: update.id,
        health: update.health,
        body: update.body,
        createdAt: iso(update.createdAt),
        updatedAt: iso(update.updatedAt),
        isOwn: Boolean(currentMemberId) && update.authorId === currentMemberId,
        author: author
          ? {
              id: author.id,
              name: author.name,
              kind: author.kind,
              avatarUrl: author.avatarUrl,
            }
          : null,
      })),
    };
  },
});
