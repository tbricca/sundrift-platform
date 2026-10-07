import { defineAction } from "@agent-native/core/action";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { cycles, issueLabels, issues, teams } from "../drizzle/schema";
import { formatIdentifier } from "../app/lib/issue-query";
import { prioritySchema } from "../server/issue-query-schema";
import { cycleState } from "../app/lib/cycle";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import updateIssue from "./update-issue";

const nullableString = z.string().nullable().optional();

/**
 * Resolves "the team's current cycle" and "the team's next cycle" per issue, so
 * a selection spanning teams still lands each issue in its own team's cycle.
 */
async function cyclesByTeam(teamIds: string[]) {
  if (teamIds.length === 0) return new Map<string, typeof rows>();
  const rows = await db
    .select()
    .from(cycles)
    .where(inArray(cycles.teamId, teamIds));
  const byTeam = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byTeam.get(row.teamId) ?? [];
    list.push(row);
    byTeam.set(row.teamId, list);
  }
  return byTeam;
}

export default defineAction({
  description:
    "Apply one patch to many issues. Every issue goes through the same write path as update-issue, so all validation (team-specific statuses and cycles, milestones belonging to the issue's project) and activity history behave identically. Labels are added or removed without disturbing an issue's other labels. Use cycleTarget 'current' or 'next' to resolve each issue's own team's cycle. Writes are sequential and not atomic: the result reports per-issue failures and the successes stand.",
  schema: z.object({
    issueIds: z.array(z.string()).min(1).max(200),
    statusId: z.string().optional(),
    priority: prioritySchema.optional(),
    assigneeId: nullableString,
    projectId: nullableString,
    milestoneId: nullableString,
    cycleId: nullableString,
    cycleTarget: z
      .enum(["current", "next"])
      .optional()
      .describe("Resolve each issue's own team's current or next cycle."),
    dueDate: nullableString,
    estimate: z.coerce.number().int().nullable().optional(),
    addLabelIds: z.array(z.string()).optional(),
    removeLabelIds: z.array(z.string()).optional(),
    archived: z.boolean().optional(),
    deleted: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const { issueIds, cycleTarget, addLabelIds, removeLabelIds, ...patch } =
      args;

    const found = await db
      .select({
        id: issues.id,
        number: issues.identifierNumber,
        teamId: issues.teamId,
        teamKey: teams.key,
      })
      .from(issues)
      .innerJoin(teams, eq(issues.teamId, teams.id))
      .where(inArray(issues.id, issueIds));
    if (found.length === 0) throw new UserError("No matching issues.");

    const rows = found.map((row) => ({
      ...row,
      identifier: formatIdentifier(row.teamKey, row.number),
    }));

    const wantsLabels = Boolean(addLabelIds?.length || removeLabelIds?.length);
    const labelsByIssue = new Map<string, string[]>();
    if (wantsLabels) {
      const current = await db
        .select()
        .from(issueLabels)
        .where(
          inArray(
            issueLabels.issueId,
            rows.map((row) => row.id),
          ),
        );
      for (const row of current) {
        labelsByIssue.set(row.issueId, [
          ...(labelsByIssue.get(row.issueId) ?? []),
          row.labelId,
        ]);
      }
    }

    const byTeam = cycleTarget
      ? await cyclesByTeam([...new Set(rows.map((row) => row.teamId))])
      : null;

    const updated: string[] = [];
    const failed: { id: string; identifier: string; error: string }[] = [];

    for (const row of rows) {
      const perIssue: Record<string, unknown> = { ...patch };

      if (cycleTarget && byTeam) {
        const teamCycles = byTeam.get(row.teamId) ?? [];
        const target =
          cycleTarget === "current"
            ? teamCycles.find((cycle) => cycleState(cycle) === "active")
            : teamCycles
                .filter((cycle) => cycleState(cycle) === "upcoming")
                .sort(
                  (a, b) =>
                    new Date(a.startsAt).getTime() -
                    new Date(b.startsAt).getTime(),
                )[0];
        if (!target) {
          failed.push({
            id: row.id,
            identifier: row.identifier,
            error:
              cycleTarget === "current"
                ? "That team has no cycle running right now."
                : "That team has no upcoming cycle.",
          });
          continue;
        }
        perIssue.cycleId = target.id;
      }

      if (wantsLabels) {
        const before = labelsByIssue.get(row.id) ?? [];
        const next = new Set(before);
        for (const id of addLabelIds ?? []) next.add(id);
        for (const id of removeLabelIds ?? []) next.delete(id);
        perIssue.labelIds = [...next];
      }

      try {
        // The same action every single-issue edit uses: one write path, one set
        // of guards, one shape of activity row.
        await updateIssue.run({ identifier: row.id, ...perIssue });
        updated.push(row.id);
      } catch (error) {
        failed.push({
          id: row.id,
          identifier: row.identifier,
          error:
            error instanceof Error ? error.message : "Could not update issue.",
        });
      }
    }

    return { updated, failed, updatedCount: updated.length };
  },
});
