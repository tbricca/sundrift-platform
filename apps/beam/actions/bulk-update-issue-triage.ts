import { defineAction } from "@agent-native/core/action";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier } from "../app/lib/issue-query";
import { issues, teams } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { prioritySchema } from "../server/issue-query-schema";

import updateIssueTriage from "./update-issue-triage";

/**
 * Bulk review, built the same way bulk editing is: one loop over the existing
 * single-issue action. Every guarantee `update-issue-triage` makes - per-team
 * default status on accept, the team's canceled status on decline, activity
 * rows, assignment notifications, cycle and project validation - therefore
 * holds for each issue in the batch, because it is literally the same call.
 *
 * Deliberately one action with a mode rather than three: accept, decline and
 * snooze differ only in which fields they carry.
 *
 * Partial success is the documented contract, matching `bulk-update-issues`:
 * the operation is not atomic, issues are reviewed independently, and a
 * failure on one leaves the others reviewed. The response reports both lists
 * so the caller can show what did not go through.
 */
export default defineAction({
  description:
    "Review several triage issues at once: accept, decline or snooze them. Each issue goes through the same path as update-issue-triage, so accepting resolves each issue's own team default status and a mixed-team selection is fine. Non-atomic: the response lists what was reviewed and what failed.",
  schema: z.object({
    issueIds: z.array(z.string()).min(1).max(200),
    action: z.enum(["accept", "decline", "snooze"]),
    statusId: z
      .string()
      .optional()
      .describe(
        "Accept: a specific status. Omit it and each issue resolves its own team's default, which is what a mixed-team selection needs.",
      ),
    assigneeId: z.string().nullable().optional(),
    priority: prioritySchema.optional(),
    projectId: z.string().nullable().optional(),
    cycleId: z.string().nullable().optional(),
    snoozedUntil: z
      .string()
      .optional()
      .describe("Snooze: one ISO date applied to every selected issue."),
    reason: z.string().optional().describe("Decline: one shared reason."),
  }),
  http: { method: "PUT" },
  run: async ({ issueIds, ...args }) => {
    const found = await db
      .select({
        id: issues.id,
        number: issues.identifierNumber,
        teamKey: teams.key,
      })
      .from(issues)
      .innerJoin(teams, eq(issues.teamId, teams.id))
      .where(inArray(issues.id, issueIds));
    if (found.length === 0) throw new UserError("No matching issues.");

    const reviewed: string[] = [];
    const failed: { id: string; identifier: string; error: string }[] = [];

    for (const row of found) {
      const identifier = formatIdentifier(row.teamKey, row.number);
      try {
        await updateIssueTriage.run({ identifier: row.id, ...args } as never);
        reviewed.push(row.id);
      } catch (error) {
        failed.push({
          id: row.id,
          identifier,
          error:
            error instanceof Error ? error.message : "Could not review issue.",
        });
      }
    }

    return { reviewed, failed, reviewedCount: reviewed.length };
  },
});
