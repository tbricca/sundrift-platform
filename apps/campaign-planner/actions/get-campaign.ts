import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { getCampaign } from "../server/records.js";

export default defineAction({
  description:
    "Get one Sundrift campaign, including the seeded product baseline and current slider lifts.",
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
      campaign,
      url: buildDeepLink({
        app: "campaign-planner",
        view: "campaign",
        to: campaign.urlPath,
        params: { campaignId: campaign.id },
      }),
      message: `${campaign.name} is ready.`,
    };
  },
});
