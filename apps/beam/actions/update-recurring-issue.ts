import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { CADENCES } from "../app/lib/recurrence";
import { issueTemplates, recurringIssueDefinitions } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { computeNextRun, validateSchedule } from "../server/recurring-issues";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Change a recurring issue rule: rename it, change its schedule or template, enable or disable it, or archive it. One action rather than several, because enabling and changing a cadence are the same kind of edit. Re-enabling recalculates the next run from now — missed occurrences are never backfilled.",
  schema: z.object({
    id: z.string(),
    name: z.string().min(1).optional(),
    templateId: z.string().optional(),
    cadence: z.enum(CADENCES).optional(),
    interval: z.number().int().min(1).max(52).optional(),
    weekdays: z.array(z.number().int().min(0).max(6)).nullable().optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    timeOfDay: z.string().optional(),
    timezone: z.string().optional(),
    cycleMode: z.enum(["none", "current_cycle", "next_cycle"]).optional(),
    assigneeId: z.string().nullable().optional(),
    projectId: z.string().nullable().optional(),
    startsAt: z.string().optional(),
    endsAt: z.string().nullable().optional(),
    enabled: z.boolean().optional(),
    archived: z.boolean().optional().describe("Archive or restore the rule."),
  }),
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace.");

    const [existing] = await db
      .select()
      .from(recurringIssueDefinitions)
      .where(eq(recurringIssueDefinitions.id, args.id))
      .limit(1);
    if (!existing) throw new UserError("Recurring rule not found.");

    if (args.templateId) {
      const [template] = await db
        .select()
        .from(issueTemplates)
        .where(eq(issueTemplates.id, args.templateId))
        .limit(1);
      if (!template) throw new UserError("Template not found.");
      if (template.teamId !== existing.teamId) {
        throw new UserError("That template belongs to a different team.");
      }
    }

    const merged = {
      cadence: args.cadence ?? existing.cadence,
      interval: args.interval ?? existing.interval,
      weekdays:
        args.weekdays === undefined ? (existing.weekdays ?? null) : args.weekdays,
      dayOfMonth:
        args.dayOfMonth === undefined ? existing.dayOfMonth : args.dayOfMonth,
      timeOfDay: args.timeOfDay ?? existing.timeOfDay,
      timezone: args.timezone ?? existing.timezone,
      startsAt: args.startsAt ? new Date(args.startsAt) : existing.startsAt,
      endsAt:
        args.endsAt === undefined
          ? existing.endsAt
          : args.endsAt === null
            ? null
            : new Date(args.endsAt),
    };

    const problem = validateSchedule(merged);
    if (problem) throw new UserError(problem);

    const enabled = args.enabled ?? existing.enabled;
    const archivedAt =
      args.archived === undefined
        ? existing.archivedAt
        : args.archived
          ? (existing.archivedAt ?? new Date())
          : null;

    const candidate = { ...existing, ...merged, enabled, archivedAt };

    /**
     * Recalculate from now whenever the schedule is touched or the rule comes
     * back on. That is what makes re-enabling resume rather than replay: the
     * gap while it was off is simply not owed.
     *
     * A disabled rule keeps a computed next run so the UI can still say when it
     * would fire; the processor ignores it because it filters on `enabled`.
     */
    const nextRunAt = computeNextRun(candidate, new Date());

    const [updated] = await db
      .update(recurringIssueDefinitions)
      .set({
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.templateId !== undefined ? { templateId: args.templateId } : {}),
        ...(args.cycleMode !== undefined ? { cycleMode: args.cycleMode } : {}),
        ...(args.assigneeId !== undefined ? { assigneeId: args.assigneeId } : {}),
        ...(args.projectId !== undefined ? { projectId: args.projectId } : {}),
        ...merged,
        enabled,
        archivedAt,
        nextRunAt,
        updatedAt: new Date(),
      })
      .where(eq(recurringIssueDefinitions.id, args.id))
      .returning();

    return {
      id: updated.id,
      enabled: updated.enabled,
      archived: updated.archivedAt !== null,
      nextRunAt: updated.nextRunAt ? updated.nextRunAt.toISOString() : null,
    };
  },
});
