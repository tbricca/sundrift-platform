import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getCampaign } from "../server/records.js";

export default defineAction({
  description:
    "Update Sundrift campaign slider lifts, the projection window, or mark the campaign complete. Local save. Does not call a model.",
  schema: z.object({
    id: z.string(),
    windowDays: z.number().int().min(1).max(365).optional(),
    sessionLiftPct: z.number().min(-50).max(200).optional(),
    conversionLiftPp: z.number().min(-20).max(40).optional(),
    aovLiftPct: z.number().min(-50).max(200).optional(),
    status: z.enum(["active", "complete"]).optional(),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const now = new Date().toISOString();
    await getDb()
      .update(schema.campaignPlans)
      .set({
        ...(args.windowDays !== undefined ? { windowDays: args.windowDays } : {}),
        ...(args.sessionLiftPct !== undefined
          ? { sessionLiftPct: args.sessionLiftPct }
          : {}),
        ...(args.conversionLiftPp !== undefined
          ? { conversionLiftPp: args.conversionLiftPp }
          : {}),
        ...(args.aovLiftPct !== undefined ? { aovLiftPct: args.aovLiftPct } : {}),
        ...(args.status ? { status: args.status } : {}),
        updatedAt: now,
      })
      .where(eq(schema.campaignPlans.id, args.id));
    const campaign = await getCampaign(args.id);
    if (!campaign) throw new Error(`Campaign not found: ${args.id}`);
    return { campaign, message: "Campaign updated." };
  },
});
