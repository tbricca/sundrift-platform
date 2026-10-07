import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { CADENCES } from "../app/lib/recurrence";
import {
  issueTemplates,
  recurringIssueDefinitions,
  teams,
} from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { computeNextRun, validateSchedule } from "../server/recurring-issues";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Create a rule that files an issue on a schedule. The rule points at an issue template rather than copying it, so editing the template changes every future issue. Cadence is daily, weekly or monthly — there is no cron syntax. The time is wall-clock in the given IANA timezone and stays put across daylight saving.",
  schema: z.object({
    teamId: z.string().optional().describe("Team id; or pass teamKey."),
    teamKey: z.string().optional().describe("Team key such as ENG."),
    name: z.string().min(1).describe("What this rule is called."),
    templateId: z
      .string()
      .describe("Issue template the generated issues start from."),
    cadence: z.enum(CADENCES),
    interval: z
      .number()
      .int()
      .min(1)
      .max(52)
      .optional()
      .describe("Every N days/weeks/months. Defaults to 1."),
    weekdays: z
      .array(z.number().int().min(0).max(6))
      .optional()
      .describe("Weekly only. 0 is Sunday. Defaults to the start date's day."),
    dayOfMonth: z
      .number()
      .int()
      .min(1)
      .max(31)
      .optional()
      .describe("Monthly only. Clamped in short months."),
    timeOfDay: z.string().optional().describe('Wall-clock "HH:MM". Defaults to 09:00.'),
    timezone: z
      .string()
      .optional()
      .describe('IANA id such as America/Los_Angeles. Defaults to UTC.'),
    cycleMode: z
      .enum(["none", "current_cycle", "next_cycle"])
      .optional()
      .describe(
        "Which cycle generated issues join, resolved per run. Defaults to none.",
      ),
    assigneeId: z.string().optional().describe("Overrides the template."),
    projectId: z.string().optional().describe("Overrides the template."),
    startsAt: z.string().optional().describe("ISO datetime. Defaults to now."),
    endsAt: z.string().optional().describe("ISO datetime. Optional."),
    enabled: z.boolean().optional().describe("Defaults to true."),
  }),
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace.");

    const [team] = await db
      .select()
      .from(teams)
      .where(
        args.teamId
          ? eq(teams.id, args.teamId)
          : eq(teams.key, (args.teamKey ?? "").toUpperCase()),
      )
      .limit(1);
    if (!team) throw new UserError("Team not found.");

    const [template] = await db
      .select()
      .from(issueTemplates)
      .where(eq(issueTemplates.id, args.templateId))
      .limit(1);
    if (!template) throw new UserError("Template not found.");
    if (template.teamId !== team.id) {
      throw new UserError("That template belongs to a different team.");
    }

    const startsAt = args.startsAt ? new Date(args.startsAt) : new Date();
    const endsAt = args.endsAt ? new Date(args.endsAt) : null;

    const draft = {
      cadence: args.cadence,
      interval: args.interval ?? 1,
      weekdays: args.weekdays ?? null,
      dayOfMonth: args.dayOfMonth ?? null,
      timeOfDay: args.timeOfDay ?? "09:00",
      timezone: args.timezone ?? "UTC",
      startsAt,
      endsAt,
    };

    const problem = validateSchedule(draft);
    if (problem) throw new UserError(problem);

    const [created] = await db
      .insert(recurringIssueDefinitions)
      .values({
        workspaceId: workspace.id,
        teamId: team.id,
        name: args.name,
        templateId: template.id,
        enabled: args.enabled ?? true,
        cycleMode: args.cycleMode ?? "none",
        assigneeId: args.assigneeId ?? null,
        projectId: args.projectId ?? null,
        createdBy: await getCurrentMemberId(),
        ...draft,
      })
      .returning();

    // The first occurrence is computed from the start date, so a rule created
    // with a past start does not immediately owe every slot since then — the
    // processor collapses a backlog anyway, but this keeps the stored value
    // honest from the outset.
    const nextRunAt = computeNextRun(
      created,
      startsAt.getTime() > Date.now() ? startsAt : new Date(),
    );

    await db
      .update(recurringIssueDefinitions)
      .set({ nextRunAt })
      .where(eq(recurringIssueDefinitions.id, created.id));

    return {
      id: created.id,
      name: created.name,
      nextRunAt: nextRunAt ? nextRunAt.toISOString() : null,
    };
  },
});
