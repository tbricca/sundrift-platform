import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { cycles, teams } from "../drizzle/schema";
import { cycleState } from "../app/lib/cycle";
import { syncTeamCycles } from "../server/cycle-maintenance";
import { EMPTY_CYCLE_METRICS, cycleMetrics } from "../server/cycle-progress";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";

export default defineAction({
  description:
    "Read one cycle: number, optional name, date range, whether it is current/upcoming/previous, issue counts, computed progress and estimate totals. Its issues are read separately with list-issues using a cycleId filter.",
  schema: z.object({ cycleId: z.string() }),
  http: { method: "GET" },
  run: async (args) => {
    const [row] = await db
      .select({ cycle: cycles, team: teams })
      .from(cycles)
      .innerJoin(teams, eq(cycles.teamId, teams.id))
      .where(eq(cycles.id, args.cycleId))
      .limit(1);
    if (!row) return null;

    await syncTeamCycles(row.team.id);
    const metrics = await cycleMetrics([row.cycle.id]);

    return {
      id: row.cycle.id,
      number: row.cycle.number,
      name: row.cycle.name,
      startsAt: iso(row.cycle.startsAt)!,
      endsAt: iso(row.cycle.endsAt)!,
      state: cycleState(row.cycle),
      metrics: metrics.get(row.cycle.id) ?? EMPTY_CYCLE_METRICS,
      team: {
        id: row.team.id,
        key: row.team.key,
        name: row.team.name,
        color: row.team.color,
      },
    };
  },
});
