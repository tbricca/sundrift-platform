import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { WorkspaceBootstrap } from "../app/lib/types";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { processRecurringIssues } from "../server/recurring-issues";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";
import {
  cycles,
  favorites,
  issues,
  labels,
  members,
  milestones,
  projects,
  savedViews,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

export default defineAction({
  description:
    "Bootstrap read for the workspace: teams, workflow statuses, members (humans and agents), labels, projects, cycles, saved views and favorites. Call this before creating or updating issues so you can resolve names to ids.",
  schema: z.object({}),
  http: { method: "GET" },
  run: async (): Promise<WorkspaceBootstrap | null> => {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    /**
     * Beam has no cron, so recurring rules fire off the back of ordinary reads,
     * the same way cycle maintenance does. This is the broadest sensible hook:
     * the bootstrap read happens whenever somebody opens Beam, and the due
     * query is one hit on a partial index that usually returns nothing.
     * Failures are logged and swallowed — a scheduling problem must never stop
     * the app from loading.
     */
    try {
      await processRecurringIssues();
    } catch (error) {
      console.error("[recurring] processing during bootstrap failed", error);
    }

    const [
      teamRows,
      memberRows,
      labelRows,
      projectRows,
      viewRows,
      currentMemberId,
    ] = await Promise.all([
      db
        .select()
        .from(teams)
        .where(eq(teams.workspaceId, workspace.id))
        .orderBy(asc(teams.name)),
      db.select().from(members).orderBy(asc(members.name)),
      db
        .select()
        .from(labels)
        .where(eq(labels.workspaceId, workspace.id))
        .orderBy(asc(labels.name)),
      db
        .select()
        .from(projects)
        .where(eq(projects.workspaceId, workspace.id))
        .orderBy(asc(projects.name)),
      db
        .select()
        .from(savedViews)
        .where(eq(savedViews.workspaceId, workspace.id))
        .orderBy(asc(savedViews.name)),
      getCurrentMemberId(),
    ]);

    const teamIds = teamRows.map((team) => team.id);
    const statusRows = teamIds.length
      ? await db
          .select()
          .from(workflowStatuses)
          .where(inArray(workflowStatuses.teamId, teamIds))
          .orderBy(asc(workflowStatuses.position))
      : [];
    const cycleRows = teamIds.length
      ? await db
          .select()
          .from(cycles)
          .where(inArray(cycles.teamId, teamIds))
          .orderBy(asc(cycles.number))
      : [];
    const projectIds = projectRows.map((project) => project.id);
    const milestoneRows = projectIds.length
      ? await db
          .select()
          .from(milestones)
          .where(inArray(milestones.projectId, projectIds))
          .orderBy(asc(milestones.sortOrder))
      : [];
    // One grouped count for the sidebar badge — never a full triage fetch.
    // "Pending" includes snoozes whose time has passed, matching the engine.
    const triageCountRows = teamIds.length
      ? await db
          .select({ teamId: issues.teamId, pending: sql<number>`count(*)::int` })
          .from(issues)
          .where(
            and(
              inArray(issues.teamId, teamIds),
              isNull(issues.deletedAt),
              isNull(issues.archivedAt),
              or(
                eq(issues.triageStatus, "pending"),
                and(
                  eq(issues.triageStatus, "snoozed"),
                  lt(issues.snoozedUntil, new Date()),
                ),
              ),
            ),
          )
          .groupBy(issues.teamId)
      : [];
    const pendingByTeam = new Map(
      triageCountRows.map((row) => [row.teamId, row.pending]),
    );

    const favoriteRows = currentMemberId
      ? await db
          .select()
          .from(favorites)
          .where(eq(favorites.userId, currentMemberId))
          .orderBy(asc(favorites.sortOrder))
      : [];

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
      },
      currentMemberId,
      members: memberRows.map((member) => ({
        id: member.id,
        name: member.name,
        kind: member.kind,
        avatarUrl: member.avatarUrl,
        email: member.email,
      })),
      teams: teamRows.map((team) => ({
        id: team.id,
        key: team.key,
        name: team.name,
        color: team.color,
        description: team.description,
        icon: team.icon,
        triageEnabled: team.triageEnabled,
        defaultTriageAssigneeId: team.defaultTriageAssigneeId,
        pendingTriageCount: pendingByTeam.get(team.id) ?? 0,
        statuses: statusRows
          .filter((status) => status.teamId === team.id)
          .map((status) => ({
            id: status.id,
            name: status.name,
            color: status.color,
            category: status.category,
            position: status.position,
          })),
        cycles: cycleRows
          .filter((cycle) => cycle.teamId === team.id)
          .map((cycle) => ({
            id: cycle.id,
            number: cycle.number,
            name: cycle.name,
            status: cycle.status,
            startsAt: iso(cycle.startsAt)!,
            endsAt: iso(cycle.endsAt)!,
          })),
      })),
      labels: labelRows.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        teamId: label.teamId,
      })),
      projects: projectRows.map((project) => ({
        id: project.id,
        name: project.name,
        summary: project.summary,
        status: project.status,
        health: project.health,
        priority: project.priority,
        targetDate: iso(project.targetDate),
        leadId: project.leadId,
        milestones: milestoneRows
          .filter((milestone) => milestone.projectId === project.id)
          .map((milestone) => ({ id: milestone.id, name: milestone.name })),
      })),
      views: viewRows.map((view) => ({
        id: view.id,
        name: view.name,
        teamId: view.teamId,
      })),
      favorites: favoriteRows.map((favorite) => ({
        id: favorite.id,
        entityType: favorite.entityType,
        entityId: favorite.entityId,
      })),
    };
  },
});
