import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getCampaign } from "../server/records.js";

export default defineAction({
  description:
    "Get the Sundrift revenue simulation for a campaign: baseline sessions, conversion, and AOV, the saved lifts, and projected revenue. The baseline is a seeded snapshot, not a live Analytics query.",
  schema: z.object({
    id: z.string().describe("Campaign id, such as campaign_weekender_midwest"),
  }),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async ({ id }) => {
    const campaign = await getCampaign(id);
    if (!campaign) throw new Error(`Campaign not found: ${id}`);
    return {
      id: campaign.id,
      name: campaign.name,
      productName: campaign.productName,
      badge: campaign.badge,
      simulation: campaign.simulation,
      message: campaign.simulation
        ? `Projected revenue is ${campaign.simulation.simulatedRevenue}.`
        : "This campaign has no product baseline.",
    };
  },
});
