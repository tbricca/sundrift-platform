import { defineAction } from "@agent-native/core/action";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import {
  issueTemplates,
  recurringIssueDefinitions,
  teams,
} from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { processRecurringIssues } from "../server/recurring-issues";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "List a team's recurring issue rules with their cadence, template, next and last run. Reading also processes any rule that has come due, which is how recurring issues fire — Beam has no cron. Read-only from the caller's point of view.",
  schema: z.object({
    teamId: z.string().optional().describe("Team id; or pass teamKey."),
    teamKey: z.string().optional().describe("Team key such as ENG."),
    includeArchived: z.boolean().optional(),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const [team] = await db
      .select()
      .from(teams)
      .where(
        args.teamId
          ? eq(teams.id, args.teamId)
          : eq(teams.key, (args.teamKey ?? "").toUpperCase()),
      )
      .limit(1);
    if (!team) return null;

    // Bringing rules up to date on read is the trigger: see the note at the
    // top of server/recurring-issues.ts. A failure here must not stop the page
    // from rendering the rules it already has.
    try {
      await processRecurringIssues(new Date(), { teamId: team.id });
    } catch (error) {
      console.error("[recurring] processing during list failed", error);
    }

    const rows = await db
      .select({
        definition: recurringIssueDefinitions,
        templateName: issueTemplates.name,
        templateArchivedAt: issueTemplates.archivedAt,
      })
      .from(recurringIssueDefinitions)
      .leftJoin(
        issueTemplates,
        eq(recurringIssueDefinitions.templateId, issueTemplates.id),
      )
      .where(
        and(
          eq(recurringIssueDefinitions.teamId, team.id),
          args.includeArchived
            ? undefined
            : isNull(recurringIssueDefinitions.archivedAt),
        ),
      )
      .orderBy(desc(recurringIssueDefinitions.createdAt));

    return {
      team: { id: team.id, key: team.key, name: team.name },
      definitions: rows.map(({ definition, templateName, templateArchivedAt }) => ({
        id: definition.id,
        name: definition.name,
        enabled: definition.enabled,
        cadence: definition.cadence,
        interval: definition.interval,
        weekdays: definition.weekdays ?? null,
        dayOfMonth: definition.dayOfMonth,
        timeOfDay: definition.timeOfDay,
        timezone: definition.timezone,
        cycleMode: definition.cycleMode,
        templateId: definition.templateId,
        templateName,
        /** Surfaces the one failure mode a rule cannot recover from itself. */
        templateArchived: Boolean(templateArchivedAt),
        assigneeId: definition.assigneeId,
        projectId: definition.projectId,
        startsAt: iso(definition.startsAt),
        endsAt: iso(definition.endsAt),
        nextRunAt: iso(definition.nextRunAt),
        lastRunAt: iso(definition.lastRunAt),
        archivedAt: iso(definition.archivedAt),
      })),
    };
  },
});
