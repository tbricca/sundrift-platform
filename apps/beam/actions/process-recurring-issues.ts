import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { processRecurringIssues } from "../server/recurring-issues";

/**
 * The scheduler entry point, such as it is.
 *
 * Beam has no cron, so recurring rules are normally processed as a side effect
 * of reading them (see `server/recurring-issues.ts`). This action exists so
 * that work has one named, callable home: if Beam ever gains a scheduled task
 * runner, pointing it here is the whole integration.
 *
 * Deliberately not exposed. `http: false` keeps it off the action route and
 * `agentTool: false` keeps it out of agent tooling — an agent should not be
 * able to make a team's recurring work fire early, and nothing outside Beam
 * should be able to poke the scheduler.
 */
export default defineAction({
  description:
    "Internal: fire every recurring issue rule that has come due. Not exposed over HTTP or to agents.",
  schema: z.object({
    now: z
      .string()
      .optional()
      .describe("ISO datetime to process as. Defaults to the current time."),
    teamId: z.string().optional().describe("Limit to one team."),
  }),
  http: false,
  agentTool: false,
  run: async (args) => {
    const now = args.now ? new Date(args.now) : new Date();
    return await processRecurringIssues(now, { teamId: args.teamId });
  },
});
