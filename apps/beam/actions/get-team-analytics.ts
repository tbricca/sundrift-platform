import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { teams } from "../drizzle/schema";
import { RANGES, resolveRange, type RangeKey } from "../app/lib/analytics";
import { getTeamAnalytics } from "../server/analytics";
import { db } from "../server/db";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Throughput figures for one team over a trailing window: issues created, completed and canceled, completion rate, median and 75th-percentile completion time, completed estimate points, a human/agent split of completions, and a created-vs-completed trend. Counted entirely in SQL. Excludes soft-deleted issues and issues still awaiting triage; includes archived issues so history is not rewritten. Read-only.",
  schema: z.object({
    teamId: z.string().optional().describe("Team id; or pass teamKey."),
    teamKey: z.string().optional().describe("Team key such as ENG."),
    range: z
      .enum(RANGES)
      .optional()
      .describe("Trailing window. Defaults to 30d."),
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

    const range: RangeKey = args.range ?? "30d";
    const window = resolveRange(range, new Date());

    const analytics = await getTeamAnalytics({
      teamId: team.id,
      start: window.start,
      end: window.end,
      granularity: window.granularity,
    });

    return {
      team: { id: team.id, key: team.key, name: team.name },
      range,
      ...analytics,
    };
  },
});
