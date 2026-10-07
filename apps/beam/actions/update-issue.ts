import { defineAction } from "@agent-native/core/action";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier } from "../app/lib/issue-query";
import { newMentionIds, parseMentionIds } from "../app/lib/mentions";
import type { ActivityMetadata } from "../app/lib/types";
import { db } from "../server/db";
import { recordCycleChange } from "../server/issue-cycle-membership";
import { prioritySchema } from "../server/issue-query-schema";
import { publishIssueChange } from "../server/realtime";
import {
  ConflictError,
  UserError,
  ancestorIds,
  issueRef,
  issueWritePolicy,
  labelRefs,
  lostVersionRace,
  milestoneProjectId,
  refFor,
  requireIssue,
} from "../server/issue-writes";
import {
  memberName,
  notifyIssueMentions,
  notifyMembers,
  subscribeToIssue,
} from "../server/notifications";
import { getCurrentMemberId } from "../server/workspace";
import {
  activities,
  cycles,
  issueLabels,
  issues,
  teams,
  workflowStatuses,
} from "../drizzle/schema";

const nullableString = z.string().nullable().optional();

type Change = { field: string; metadata: ActivityMetadata };

export default defineAction({
  description:
    "Update one issue. Pass only the fields that change. Moving into a completed or canceled status sets the matching timestamp, `deleted: true` soft-deletes (and `deleted: false` restores), and every real change appends a structured activity row. Pass expectedVersion (from get-issue/list-issues) to be told when someone else changed the issue first.",
  schema: z.object({
    identifier: z
      .string()
      .describe("Issue identifier such as ENG-142, or the raw issue id"),
    expectedVersion: z.coerce
      .number()
      .int()
      .optional()
      .describe("Version the caller last read; rejects stale overwrites"),
    title: z.string().optional(),
    description: nullableString,
    statusId: z.string().optional(),
    priority: prioritySchema.optional(),
    assigneeId: nullableString.describe("Member id, or null to unassign"),
    projectId: nullableString,
    cycleId: nullableString,
    milestoneId: nullableString,
    parentIssueId: nullableString.describe(
      "Parent issue id, or null to detach",
    ),
    estimate: z.coerce.number().int().nullable().optional(),
    dueDate: nullableString.describe("ISO date, or null to clear"),
    labelIds: z
      .array(z.string())
      .optional()
      .describe("Replaces the full label set"),
    sortOrder: z.coerce.number().optional(),
    archived: z.boolean().optional(),
    deleted: z.boolean().optional().describe("Soft delete or restore"),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    // Deleted issues resolve here only so `deleted: false` can restore them.
    const issue = await requireIssue(args.identifier, { includeDeleted: true });

    const policy = issueWritePolicy(issue, args);
    if (policy.reject) throw new UserError(policy.reject, 409);

    // Preflight: fails fast with the current version and lets the diffing below
    // read the pre-write row. The authoritative guard is the CAS on the UPDATE.
    if (
      args.expectedVersion !== undefined &&
      args.expectedVersion !== issue.version
    ) {
      throw new ConflictError(issue.version);
    }

    const actorId = await getCurrentMemberId();
    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const changes: Change[] = [];

    const simple = async (
      field: string,
      from: unknown,
      to: unknown,
      column = field,
      describe?: (value: unknown) => Promise<ActivityMetadata["to"]>,
    ) => {
      if (from === to) return;
      patch[column] = to;
      changes.push({
        field,
        metadata: {
          field,
          from: describe ? await describe(from) : (from as never),
          to: describe ? await describe(to) : (to as never),
        },
      });
    };

    if (args.title !== undefined)
      await simple("title", issue.title, args.title);
    if (args.estimate !== undefined) {
      await simple("estimate", issue.estimate, args.estimate);
    }
    if (args.priority !== undefined) {
      await simple("priority", issue.priority, args.priority);
    }
    if (args.sortOrder !== undefined && args.sortOrder !== issue.sortOrder) {
      patch.sortOrder = args.sortOrder;
    }

    if (args.description !== undefined) {
      if (args.description !== issue.description) {
        patch.description = args.description;
        patch.mentions = parseMentionIds(args.description);
        changes.push({
          field: "description",
          metadata: { field: "description" },
        });
      }
    }

    if (args.assigneeId !== undefined) {
      await simple(
        "assignee",
        issue.assigneeId,
        args.assigneeId,
        "assigneeId",
        (value) => refFor("member", value as string | null),
      );
    }
    if (args.projectId !== undefined) {
      await simple(
        "project",
        issue.projectId,
        args.projectId,
        "projectId",
        (value) => refFor("project", value as string | null),
      );
    }
    if (args.cycleId !== undefined) {
      // Cycles are per-team, so an issue can only ever sit in one of its own
      // team's cycles.
      if (args.cycleId) {
        const [cycle] = await db
          .select({ teamId: cycles.teamId })
          .from(cycles)
          .where(eq(cycles.id, args.cycleId))
          .limit(1);
        if (!cycle) throw new UserError("Cycle not found.");
        if (cycle.teamId !== issue.teamId) {
          throw new UserError("That cycle belongs to a different team.");
        }
      }
      await simple("cycle", issue.cycleId, args.cycleId, "cycleId", (value) =>
        refFor("cycle", value as string | null),
      );
    }
    // A milestone only ever belongs to one project, so the two move together:
    // an explicit milestone must match the project the issue will end up on,
    // and moving the issue to another project (or off projects) clears it.
    const nextProjectId =
      args.projectId !== undefined ? args.projectId : issue.projectId;

    if (args.milestoneId) {
      const owner = await milestoneProjectId(args.milestoneId);
      if (!owner) throw new UserError("Milestone not found.");
      if (owner !== nextProjectId) {
        throw new UserError(
          "That milestone belongs to a different project than the issue.",
        );
      }
    }

    const milestoneTarget =
      args.milestoneId !== undefined
        ? args.milestoneId
        : nextProjectId === issue.projectId
          ? undefined
          : null;

    if (milestoneTarget !== undefined) {
      await simple(
        "milestone",
        issue.milestoneId,
        milestoneTarget,
        "milestoneId",
        (value) => refFor("milestone", value as string | null),
      );
    }

    if (args.parentIssueId !== undefined) {
      // Callers may pass an identifier like ENG-12; everything below compares ids.
      const parent = args.parentIssueId
        ? await requireIssue(args.parentIssueId)
        : null;

      if (parent?.id === issue.id) {
        throw new UserError("An issue cannot be its own parent.");
      }
      if (parent) {
        if (parent.teamId !== issue.teamId) {
          throw new UserError(
            "A sub-issue must stay on the same team as its parent.",
          );
        }
        const parentAncestors = await ancestorIds(parent.id);
        if (parentAncestors.includes(issue.id)) {
          throw new UserError(
            "That issue is already a descendant of this one, which would create a loop.",
          );
        }
      }
      await simple(
        "parent",
        issue.parentIssueId,
        parent?.id ?? null,
        "parentIssueId",
        (value) => issueRef(value as string | null),
      );
    }

    if (args.dueDate !== undefined) {
      const nextDue = args.dueDate ? new Date(args.dueDate) : null;
      const previous = issue.dueDate ? issue.dueDate.toISOString() : null;
      const next = nextDue ? nextDue.toISOString() : null;
      if (previous !== next) {
        patch.dueDate = nextDue;
        changes.push({
          field: "dueDate",
          metadata: { field: "dueDate", from: previous, to: next },
        });
      }
    }

    if (args.statusId !== undefined && args.statusId !== issue.statusId) {
      const [status] = await db
        .select()
        .from(workflowStatuses)
        .where(eq(workflowStatuses.id, args.statusId))
        .limit(1);
      if (!status) throw new UserError("Workflow status not found.");
      if (status.teamId !== issue.teamId) {
        throw new UserError("That status belongs to a different team.");
      }
      patch.statusId = status.id;
      patch.completedAt =
        status.category === "completed"
          ? (issue.completedAt ?? new Date())
          : null;
      patch.canceledAt =
        status.category === "canceled"
          ? (issue.canceledAt ?? new Date())
          : null;
      changes.push({
        field: "status",
        metadata: {
          field: "status",
          from: await refFor("status", issue.statusId),
          to: { id: status.id, name: status.name },
        },
      });
    }

    if (args.archived !== undefined) {
      const isArchived = Boolean(issue.archivedAt);
      if (isArchived !== args.archived) {
        patch.archivedAt = args.archived ? new Date() : null;
        changes.push({
          field: "archived",
          metadata: { field: "archived", to: args.archived },
        });
      }
    }

    if (args.deleted !== undefined) {
      const isDeleted = Boolean(issue.deletedAt);
      if (isDeleted !== args.deleted) {
        patch.deletedAt = args.deleted ? new Date() : null;
        changes.push({
          field: "deleted",
          metadata: { field: "deleted", to: args.deleted },
        });
      }
    }

    let labelChange: Change | null = null;
    if (args.labelIds) {
      const current = await db
        .select({ labelId: issueLabels.labelId })
        .from(issueLabels)
        .where(eq(issueLabels.issueId, issue.id));
      const currentIds = current.map((row) => row.labelId);
      const added = args.labelIds.filter((id) => !currentIds.includes(id));
      const removed = currentIds.filter((id) => !args.labelIds!.includes(id));

      if (added.length || removed.length) {
        for (const labelId of removed) {
          await db
            .delete(issueLabels)
            .where(
              and(
                eq(issueLabels.issueId, issue.id),
                eq(issueLabels.labelId, labelId),
              ),
            );
        }
        if (added.length) {
          await db
            .insert(issueLabels)
            .values(added.map((labelId) => ({ issueId: issue.id, labelId })));
        }
        labelChange = {
          field: "labels",
          metadata: {
            field: "labels",
            added: await labelRefs(added),
            removed: await labelRefs(removed),
          },
        };
        changes.push(labelChange);
      }
    }

    // A version bump only makes sense when something actually changed.
    const hasFieldChange = Object.keys(patch).length > 1;
    if (hasFieldChange) {
      patch.version = sql`${issues.version} + 1`;
    }

    // Compare-and-swap. When the caller stated a version, the version has to
    // still be that value at write time or the row is left alone — a preflight
    // check alone leaves a window where a concurrent writer slips in between
    // the read and the update. Callers that omit expectedVersion keep the
    // previous last-write-wins behaviour.
    const guard =
      policy.guardVersion && args.expectedVersion !== undefined
        ? and(eq(issues.id, issue.id), eq(issues.version, args.expectedVersion))
        : eq(issues.id, issue.id);

    const written =
      hasFieldChange || labelChange
        ? await db
            .update(issues)
            .set(hasFieldChange ? patch : { updatedAt: new Date() })
            .where(guard)
            .returning()
        : [issue];

    if (lostVersionRace(written.length, policy)) {
      // The guard matched nothing, so someone else moved the row first.
      const [current] = await db
        .select({ version: issues.version })
        .from(issues)
        .where(eq(issues.id, issue.id))
        .limit(1);
      throw new ConflictError(current?.version ?? issue.version);
    }

    const [updated] = written;

    // `simple()` only writes to the patch when the value actually moved, so
    // this is exactly "the cycle changed" — re-saving the same cycle records
    // nothing and leaves the open membership interval intact.
    if ("cycleId" in patch) {
      await recordCycleChange({
        issueId: issue.id,
        teamId: issue.teamId,
        toCycleId: patch.cycleId as string | null,
        actorId,
      });
    }

    if (changes.length) {
      await db.insert(activities).values(
        changes.map((change) => ({
          issueId: issue.id,
          actorId,
          type: `${change.field}_changed`,
          metadata: change.metadata as Record<string, unknown>,
        })),
      );
    }

    // Notifications are derived from the diff that was just applied, so an
    // unchanged assignee or an edit that adds no new mention notifies nobody.
    const assigneeChanged = changes.some(
      (change) => change.field === "assignee",
    );
    const descriptionChanged = changes.some(
      (change) => change.field === "description",
    );

    if (assigneeChanged || descriptionChanged) {
      const [key] = await db
        .select({ key: teams.key })
        .from(teams)
        .where(eq(teams.id, issue.teamId))
        .limit(1);
      const context = {
        issueId: issue.id,
        identifier: formatIdentifier(key?.key ?? "", issue.identifierNumber),
        title: updated.title,
        actorId,
        actorName: await memberName(actorId),
      };

      const mentioned = descriptionChanged
        ? await notifyIssueMentions(
            context,
            newMentionIds(issue.mentions, updated.mentions),
          )
        : [];

      if (assigneeChanged && updated.assigneeId) {
        await subscribeToIssue(issue.id, [updated.assigneeId]);
        await notifyMembers({
          recipientIds: [updated.assigneeId],
          type: "issue_assigned",
          entityType: "issue",
          entityId: issue.id,
          actorId,
          exclude: mentioned,
          metadata: {
            issueIdentifier: context.identifier,
            issueTitle: context.title,
            actorName: context.actorName,
          },
        });
      }
    }

    publishIssueChange({
      id: updated.id,
      version: updated.version,
      projectId: updated.projectId,
      cycleId: updated.cycleId,
      triage: updated.triageStatus !== null,
      deleted: updated.deletedAt !== null,
    });

    return {
      id: updated.id,
      version: updated.version,
      changed: changes.map((change) => change.field),
    };
  },
});
