import { defineAction } from "@agent-native/core/action";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier } from "../app/lib/issue-query";
import {
  issueTemplates,
  issues,
  recurringIssueDefinitions,
  recurringIssueRuns,
  teams,
} from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { getWorkspace } from "../server/workspace";

/** Enough history to see a pattern, not enough to be a job monitor. */
const RUN_LIMIT = 20;

export default defineAction({
  description:
    "One recurring issue rule with its recent run history: when each occurrence was due, whether it produced an issue, and the identifier of the issue it created. Read-only.",
  schema: z.object({
    id: z.string().describe("Recurring rule id."),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const [row] = await db
      .select({
        definition: recurringIssueDefinitions,
        team: teams,
        templateName: issueTemplates.name,
        templateArchivedAt: issueTemplates.archivedAt,
      })
      .from(recurringIssueDefinitions)
      .innerJoin(teams, eq(recurringIssueDefinitions.teamId, teams.id))
      .leftJoin(
        issueTemplates,
        eq(recurringIssueDefinitions.templateId, issueTemplates.id),
      )
      .where(eq(recurringIssueDefinitions.id, args.id))
      .limit(1);
    if (!row) return null;

    const runs = await db
      .select({
        run: recurringIssueRuns,
        identifierNumber: issues.identifierNumber,
      })
      .from(recurringIssueRuns)
      .leftJoin(issues, eq(recurringIssueRuns.issueId, issues.id))
      .where(eq(recurringIssueRuns.definitionId, args.id))
      .orderBy(desc(recurringIssueRuns.createdAt))
      .limit(RUN_LIMIT);

    return {
      id: row.definition.id,
      name: row.definition.name,
      enabled: row.definition.enabled,
      cadence: row.definition.cadence,
      interval: row.definition.interval,
      weekdays: row.definition.weekdays ?? null,
      dayOfMonth: row.definition.dayOfMonth,
      timeOfDay: row.definition.timeOfDay,
      timezone: row.definition.timezone,
      cycleMode: row.definition.cycleMode,
      templateId: row.definition.templateId,
      templateName: row.templateName,
      templateArchived: Boolean(row.templateArchivedAt),
      assigneeId: row.definition.assigneeId,
      projectId: row.definition.projectId,
      startsAt: iso(row.definition.startsAt),
      endsAt: iso(row.definition.endsAt),
      nextRunAt: iso(row.definition.nextRunAt),
      lastRunAt: iso(row.definition.lastRunAt),
      archivedAt: iso(row.definition.archivedAt),
      team: { id: row.team.id, key: row.team.key, name: row.team.name },
      runs: runs.map(({ run, identifierNumber }) => ({
        id: run.id,
        scheduledFor: iso(run.scheduledFor),
        status: run.status,
        manual: run.manual,
        error: run.error,
        createdAt: iso(run.createdAt),
        issueId: run.issueId,
        identifier:
          identifierNumber === null
            ? null
            : formatIdentifier(row.team.key, identifierNumber),
      })),
    };
  },
});
