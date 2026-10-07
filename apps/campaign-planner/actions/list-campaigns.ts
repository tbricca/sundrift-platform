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
    return {
      campaigns,
      products: DEMO_PRODUCTS,
      count: campaigns.length,
      summary: `${campaigns.length} campaigns are seeded.`,
    };
  },
});
