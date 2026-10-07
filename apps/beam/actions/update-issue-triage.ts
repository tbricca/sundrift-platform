import { defineAction } from "@agent-native/core/action";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import { UserError, requireIssue } from "../server/issue-writes";
import { publishIssueChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";
import { activities, issues, workflowStatuses } from "../drizzle/schema";

import updateIssue from "./update-issue";
import { prioritySchema } from "../server/issue-query-schema";

/**
 * Reviewing an issue is two things at once: a triage state change, which only
 * exists here, and ordinary issue edits, which are delegated to `update-issue`
 * so team-scoped statuses, cross-project milestones, cycle ownership,
 * completion timestamps, activity rows and assignment notifications all behave
 * exactly as they do anywhere else. No workflow rule is reimplemented.
 */
export default defineAction({
  description:
    "Review an issue sitting in triage: accept it into the team's workflow, decline it (canceled, never deleted), or snooze it until a date. Accepting may also set status, assignee, priority, project and cycle in the same call.",
  schema: z.object({
    identifier: z
      .string()
      .describe("Issue identifier such as ENG-142, or the raw issue id"),
    action: z.enum(["accept", "decline", "snooze"]),
    statusId: z.string().optional().describe("Accept: target workflow status"),
    assigneeId: z.string().nullable().optional(),
    priority: prioritySchema.optional(),
    projectId: z.string().nullable().optional(),
    cycleId: z.string().nullable().optional(),
    snoozedUntil: z
      .string()
      .optional()
      .describe(
        "Snooze: ISO date. The issue returns to Pending once it passes.",
      ),
    reason: z
      .string()
      .optional()
      .describe("Decline: short reason, stored on the activity row"),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const issue = await requireIssue(args.identifier);
    if (!issue.triageStatus) {
      throw new UserError("That issue is not in triage.");
    }

    const actorId = await getCurrentMemberId();
    const now = new Date();

    if (args.action === "snooze") {
      if (!args.snoozedUntil) {
        throw new UserError("A snooze needs a date.");
      }
      const until = new Date(args.snoozedUntil);
      if (Number.isNaN(until.getTime())) {
        throw new UserError("That snooze date is not a valid date.");
      }
      await db
        .update(issues)
        .set({ triageStatus: "snoozed", snoozedUntil: until })
        .where(eq(issues.id, issue.id));
      await db.insert(activities).values({
        issueId: issue.id,
        actorId,
        type: "triage_snoozed",
        metadata: { field: "triage", to: until.toISOString() },
      });
      publishIssueChange({ id: issue.id, triage: true });

      return {
        id: issue.id,
        triageStatus: "snoozed",
        snoozedUntil: until.toISOString(),
      };
    }

    // Both accept and decline need a status: the team's default unstarted
    // status for an accept, its canceled status for a decline.
    const teamStatuses = await db
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.teamId, issue.teamId))
      .orderBy(asc(workflowStatuses.position));

    const patch: Record<string, unknown> = { identifier: args.identifier };

    if (args.action === "accept") {
      const current = teamStatuses.find(
        (status) => status.id === issue.statusId,
      );
      // A status the intake already set is respected unless it is canceled.
      const keepCurrent = current && current.category !== "canceled";
      const fallback =
        teamStatuses.find((status) => status.category === "unstarted") ??
        teamStatuses[0];
      patch.statusId =
        args.statusId ?? (keepCurrent ? issue.statusId : fallback?.id);

      if (args.assigneeId !== undefined) patch.assigneeId = args.assigneeId;
      if (args.priority !== undefined) patch.priority = args.priority;
      if (args.projectId !== undefined) patch.projectId = args.projectId;
      if (args.cycleId !== undefined) patch.cycleId = args.cycleId;
    } else {
      const canceled = teamStatuses.find(
        (status) => status.category === "canceled",
      );
      if (canceled) patch.statusId = canceled.id;
    }

    // Validation, activity and notifications all come from the normal path.
    await updateIssue.run(patch as never);

    await db
      .update(issues)
      .set({
        triageStatus: args.action === "accept" ? "accepted" : "declined",
        triagedAt: now,
        triagedBy: actorId,
        snoozedUntil: null,
      })
      .where(eq(issues.id, issue.id));

    await db.insert(activities).values({
      issueId: issue.id,
      actorId,
      type: args.action === "accept" ? "triage_accepted" : "triage_declined",
      metadata: {
        field: "triage",
        to: args.action === "accept" ? "accepted" : "declined",
        statusId: patch.statusId ?? null,
        reason: args.reason ?? null,
      },
    });

    // `update-issue` already announced the field changes; this says the review
    // state moved, which is what the queue and the pending badge watch.
    publishIssueChange({ id: issue.id, triage: true });

    return {
      id: issue.id,
      triageStatus: args.action === "accept" ? "accepted" : "declined",
      statusId: patch.statusId ?? issue.statusId,
    };
  },
});
