import { and, eq, inArray } from "drizzle-orm";

import { issues, projectTeams, projects } from "../drizzle/schema";

import { db } from "./db";
import { UserError } from "./issue-writes";

export async function requireProject(projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!project) throw new UserError(`Project not found: ${projectId}`, 404);
  return project;
}

export async function setProjectTeams(projectId: string, teamIds: string[]) {
  const existing = await db
    .select({ teamId: projectTeams.teamId })
    .from(projectTeams)
    .where(eq(projectTeams.projectId, projectId));

  const current = new Set(existing.map((row) => row.teamId));
  const next = new Set(teamIds);

  const removed = [...current].filter((teamId) => !next.has(teamId));
  if (removed.length) {
    // Removing a team that still has issues on the project would leave those
    // issues stranded, so the association is kept and the caller is told why.
    const stranded = await db
      .select({ teamId: issues.teamId })
      .from(issues)
      .where(
        and(eq(issues.projectId, projectId), inArray(issues.teamId, removed)),
      )
      .limit(1);
    if (stranded.length) {
      throw new UserError(
        "That team still has issues in this project. Move or remove those issues first.",
      );
    }
    await db
      .delete(projectTeams)
      .where(
        and(
          eq(projectTeams.projectId, projectId),
          inArray(projectTeams.teamId, removed),
        ),
      );
  }

  const added = teamIds.filter((teamId) => !current.has(teamId));
  if (added.length) {
    await db
      .insert(projectTeams)
      .values(added.map((teamId) => ({ projectId, teamId })))
      .onConflictDoNothing();
  }
}
