import { defineAction } from "@agent-native/core/action";
import { DEMO_PRODUCTS } from "@sundrift/shared";
import { z } from "zod";

import { listCampaigns } from "../server/records.js";

export default defineAction({
  description:
    "List Sundrift campaigns and the merchandising catalog (sessions, conversion, AOV) used by the revenue simulator.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const campaigns = await listCampaigns();
    const statusCounts = {
      reviewing: campaigns.filter((campaign) => campaign.workflowStatus === "reviewing")
        .length,
      deployed: campaigns.filter((campaign) => campaign.stages.deploy).length,
      completed: campaigns.filter((campaign) => campaign.status === "complete").length,
    };
    return {
      campaigns,
      products: DEMO_PRODUCTS,
      total: campaigns.length,
      count: campaigns.length,
      statusCounts,
      summary: `${campaigns.length} campaigns are seeded.`,
    };
  },
});
