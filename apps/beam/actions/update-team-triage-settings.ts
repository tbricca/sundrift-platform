import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { teams } from "../drizzle/schema";

export default defineAction({
  description:
    "Turn a team's triage queue on or off, and optionally set the member who is assigned by default when an issue is accepted.",
  schema: z.object({
    teamId: z.string(),
    triageEnabled: z.boolean().optional(),
    defaultTriageAssigneeId: z.string().nullable().optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const patch: Record<string, unknown> = {};
    if (args.triageEnabled !== undefined) {
      patch.triageEnabled = args.triageEnabled;
    }
    if (args.defaultTriageAssigneeId !== undefined) {
      patch.defaultTriageAssigneeId = args.defaultTriageAssigneeId;
    }
    if (Object.keys(patch).length === 0) {
      throw new UserError("Nothing to change.");
    }

    const [team] = await db
      .update(teams)
      .set(patch)
      .where(eq(teams.id, args.teamId))
      .returning();
    if (!team) throw new UserError("Team not found.", 404);

    return {
      teamId: team.id,
      triageEnabled: team.triageEnabled,
      defaultTriageAssigneeId: team.defaultTriageAssigneeId,
    };
  },
});
