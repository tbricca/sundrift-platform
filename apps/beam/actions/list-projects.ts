import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import {
  favorites,
  members,
  projectTeams,
  projects,
  teams,
} from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { EMPTY_PROGRESS, projectProgress } from "../server/project-progress";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "List workspace projects with lead, health, status, target date, participating teams and progress computed from their issues (completed / non-canceled).",
  schema: z.object({
    teamId: z
      .string()
      .optional()
      .describe("Only projects this team participates in."),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return { projects: [] };
    const currentMemberId = await getCurrentMemberId();

    const rows = await db
      .select({ project: projects, lead: members })
      .from(projects)
      .leftJoin(members, eq(projects.leadId, members.id))
      .where(eq(projects.workspaceId, workspace.id))
      .orderBy(asc(projects.name));

    const projectIds = rows.map((row) => row.project.id);
    const [teamRows, progress, favoriteRows] = await Promise.all([
      projectIds.length
        ? db
            .select({
              projectId: projectTeams.projectId,
              id: teams.id,
              key: teams.key,
              name: teams.name,
              color: teams.color,
            })
            .from(projectTeams)
            .innerJoin(teams, eq(projectTeams.teamId, teams.id))
            .where(inArray(projectTeams.projectId, projectIds))
        : [],
      projectProgress(projectIds),
      currentMemberId
        ? db
            .select()
            .from(favorites)
            .where(
              and(
                eq(favorites.userId, currentMemberId),
                eq(favorites.entityType, "project"),
              ),
            )
        : [],
    ]);

    const favoriteIds = new Set(favoriteRows.map((row) => row.entityId));

    const list = rows.map(({ project, lead }) => ({
      id: project.id,
      name: project.name,
      summary: project.summary,
      status: project.status,
      priority: project.priority,
      health: project.health,
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            kind: lead.kind,
            avatarUrl: lead.avatarUrl,
          }
        : null,
      startDate: iso(project.startDate),
      targetDate: iso(project.targetDate),
      updatedAt: iso(project.updatedAt),
      createdAt: iso(project.createdAt),
      completedAt: iso(project.completedAt),
      teams: teamRows
        .filter((row) => row.projectId === project.id)
        .map((row) => ({
          id: row.id,
          key: row.key,
          name: row.name,
          color: row.color,
        })),
      progress: progress.get(project.id) ?? EMPTY_PROGRESS,
      isFavorite: favoriteIds.has(project.id),
    }));

    const filtered = args.teamId
      ? list.filter((project) =>
          project.teams.some((team) => team.id === args.teamId),
        )
      : list;

    return { projects: filtered };
  },
});
