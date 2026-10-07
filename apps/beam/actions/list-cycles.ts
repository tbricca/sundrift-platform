import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { teams } from "../drizzle/schema";
import { cycleState } from "../app/lib/cycle";
import { EMPTY_CYCLE_METRICS, cycleMetrics } from "../server/cycle-progress";
import { syncTeamCycles } from "../server/cycle-maintenance";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "List a team's cycles grouped as current, upcoming and previous, each with issue counts, computed progress and estimate totals. Reading also brings the team's cycles up to date (creates upcoming cycles and rolls unfinished issues forward when those settings are on).",
  schema: z.object({
    teamId: z.string().optional().describe("Team id; or pass teamKey."),
    teamKey: z.string().optional().describe("Team key such as ENG."),
    previousLimit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("How many finished cycles to return. Defaults to 6."),
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

    const { cycles: rows, rolledOver } = await syncTeamCycles(team.id);
    const metrics = await cycleMetrics(rows.map((row) => row.id));
    const now = Date.now();

    const all = rows.map((row) => ({
      id: row.id,
      number: row.number,
      name: row.name,
      startsAt: iso(row.startsAt)!,
      endsAt: iso(row.endsAt)!,
      state: cycleState(row, now),
      metrics: metrics.get(row.id) ?? EMPTY_CYCLE_METRICS,
    }));

    const previousLimit = args.previousLimit ?? 6;

    return {
      team: {
        id: team.id,
        key: team.key,
        name: team.name,
        color: team.color,
        settings: {
          cyclesEnabled: team.cyclesEnabled,
          durationWeeks: team.cycleDurationWeeks,
          startDay: team.cycleStartDay,
          autoCreate: team.cycleAutoCreate,
          autoRollover: team.cycleAutoRollover,
        },
      },
      rolledOver,
      current: all.find((cycle) => cycle.state === "active") ?? null,
      upcoming: all
        .filter((cycle) => cycle.state === "upcoming")
        .sort((a, b) => a.number - b.number),
      previous: all
        .filter((cycle) => cycle.state === "completed")
        .sort((a, b) => b.number - a.number)
        .slice(0, previousLimit),
      previousTotal: all.filter((cycle) => cycle.state === "completed").length,
    };
  },
});
