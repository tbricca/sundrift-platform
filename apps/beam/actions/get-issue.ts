import { defineAction } from "@agent-native/core/action";
import { asc, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";

import type { IssueDetail, RelationEntry } from "../app/lib/types";
import { db } from "../server/db";
import { iso, runIssueQuery } from "../server/issue-engine";
import { ancestorIds, resolveIssue } from "../server/issue-writes";
import { isSubscribed } from "../server/notifications";
import { getCurrentMemberId } from "../server/workspace";
import {
  activities,
  comments,
  issueRelations,
  issues,
  members,
  milestones,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

export default defineAction({
  description:
    "Get one issue in full: description, properties, sub-issues with progress, relations, comments and activity. Accepts an identifier like ENG-142 or a raw issue id.",
  schema: z.object({
    identifier: z
      .string()
      .describe("Issue identifier such as ENG-142, or the raw issue id"),
  }),
  http: { method: "GET" },
  run: async ({ identifier }): Promise<IssueDetail | null> => {
    // Detail stays readable after a soft delete so Undo has something to show.
    const resolved = await resolveIssue(identifier, { includeDeleted: true });
    if (!resolved) return null;
    const issueId = resolved.id;

    const { groups } = await runIssueQuery({
      filters: { issueId: [issueId], includeArchived: true, includeDeleted: true },
      grouping: "none",
      ordering: [{ field: "manual", direction: "asc" }],
      layout: "list",
      visibleColumns: [],
    });
    const base = groups[0]?.issues[0];
    if (!base) return null;

    const [
      commentRows,
      activityRows,
      relationRows,
      subIssueResult,
      milestoneRow,
      creatorRow,
      parentRow,
      ancestors,
    ] = await Promise.all([
      db
        .select({ comment: comments, author: members })
        .from(comments)
        .leftJoin(members, eq(comments.userId, members.id))
        .where(eq(comments.issueId, issueId))
        .orderBy(asc(comments.createdAt)),
      db
        .select({ activity: activities, actor: members })
        .from(activities)
        .leftJoin(members, eq(activities.actorId, members.id))
        .where(eq(activities.issueId, issueId))
        .orderBy(desc(activities.createdAt)),
      db
        .select()
        .from(issueRelations)
        .where(
          or(
            eq(issueRelations.issueId, issueId),
            eq(issueRelations.relatedIssueId, issueId),
          ),
        ),
      runIssueQuery({
        filters: { parentIssueId: issueId },
        grouping: "none",
        ordering: [{ field: "manual", direction: "asc" }],
        layout: "list",
        visibleColumns: [],
      }),
      resolved.milestoneId
        ? db
            .select()
            .from(milestones)
            .where(eq(milestones.id, resolved.milestoneId))
            .limit(1)
        : Promise.resolve([]),
      resolved.createdBy
        ? db
            .select()
            .from(members)
            .where(eq(members.id, resolved.createdBy))
            .limit(1)
        : Promise.resolve([]),
      resolved.parentIssueId
        ? db
            .select({ issue: issues, team: teams })
            .from(issues)
            .innerJoin(teams, eq(issues.teamId, teams.id))
            .where(eq(issues.id, resolved.parentIssueId))
            .limit(1)
        : Promise.resolve([]),
      ancestorIds(issueId),
    ]);

    const currentMemberId = await getCurrentMemberId();
    const subscribed = currentMemberId
      ? await isSubscribed(issueId, currentMemberId)
      : false;

    const relatedIds = relationRows.map((relation) =>
      relation.issueId === issueId ? relation.relatedIssueId : relation.issueId,
    );
    const relatedIssues = relatedIds.length
      ? await db
          .select({ issue: issues, team: teams, status: workflowStatuses })
          .from(issues)
          .innerJoin(teams, eq(issues.teamId, teams.id))
          .innerJoin(workflowStatuses, eq(issues.statusId, workflowStatuses.id))
          .where(inArray(issues.id, relatedIds))
      : [];

    // Rows are canonical; `blocks` reads as `blocked by` from the other side.
    const relations: RelationEntry[] = relationRows.flatMap((relation) => {
      const outgoing = relation.issueId === issueId;
      const otherId = outgoing ? relation.relatedIssueId : relation.issueId;
      const other = relatedIssues.find((entry) => entry.issue.id === otherId);
      if (!other || other.issue.deletedAt) return [];
      const type =
        relation.type === "blocks"
          ? outgoing
            ? "blocks"
            : "blocked_by"
          : relation.type;
      return [
        {
          id: relation.id,
          type,
          issue: {
            id: other.issue.id,
            identifier: `${other.team.key}-${other.issue.identifierNumber}`,
            title: other.issue.title,
            statusColor: other.status.color,
          },
        },
      ];
    });

    const subIssues = subIssueResult.groups[0]?.issues ?? [];
    const countable = subIssues.filter(
      (child) => child.status.category !== "canceled",
    );
    const subIssueProgress = countable.length
      ? {
          completed: countable.filter(
            (child) => child.status.category === "completed",
          ).length,
          total: countable.length,
        }
      : null;

    return {
      ...base,
      description: resolved.description,
      mentions: resolved.mentions ?? [],
      milestone: milestoneRow[0]
        ? { id: milestoneRow[0].id, name: milestoneRow[0].name }
        : null,
      createdBy: creatorRow[0]
        ? {
            id: creatorRow[0].id,
            name: creatorRow[0].name,
            kind: creatorRow[0].kind,
            avatarUrl: creatorRow[0].avatarUrl,
          }
        : null,
      comments: commentRows
        .filter(({ comment }) => !comment.deletedAt)
        .map(({ comment, author }) => ({
          id: comment.id,
          body: comment.body,
          mentions: comment.mentions ?? [],
          createdAt: iso(comment.createdAt)!,
          updatedAt: iso(comment.updatedAt)!,
          author: author
            ? {
                id: author.id,
                name: author.name,
                kind: author.kind,
                avatarUrl: author.avatarUrl,
              }
            : null,
        })),
      activity: activityRows.map(({ activity, actor }) => ({
        id: activity.id,
        type: activity.type,
        metadata: (activity.metadata as IssueDetail["activity"][number]["metadata"]) ?? null,
        createdAt: iso(activity.createdAt)!,
        actor: actor
          ? {
              id: actor.id,
              name: actor.name,
              kind: actor.kind,
              avatarUrl: actor.avatarUrl,
            }
          : null,
      })),
      relations,
      subIssues,
      subIssueProgress,
      subscribed,
      parent: parentRow[0]
        ? {
            id: parentRow[0].issue.id,
            identifier: `${parentRow[0].team.key}-${parentRow[0].issue.identifierNumber}`,
            title: parentRow[0].issue.title,
          }
        : null,
      ancestorIds: ancestors,
    };
  },
});
