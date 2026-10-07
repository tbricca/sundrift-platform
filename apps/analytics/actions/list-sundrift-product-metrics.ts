import { defineAction } from "@agent-native/core/action";
import { DEMO_CAMPAIGNS, DEMO_PRODUCTS, simulateCampaign } from "@sundrift/shared";
import { z } from "zod";

export default defineAction({
  description:
    "List seeded Sundrift product metrics (sessions, conversion, AOV, revenue) and campaign projections. These are catalog snapshots, not a live analytics query.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const products = DEMO_PRODUCTS.map((product) => ({
      ...product,
      revenue: Math.round(product.sessions * (product.conversionPct / 100) * product.aov * 100) / 100,
    }));
    const campaigns = DEMO_CAMPAIGNS.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      productId: campaign.productId,
      simulation: simulateCampaign(campaign),
    }));
    return {
      windowDays: 180,
      products,
      campaigns,
      dashboardId: "sundrift-product-traffic",
      path: "/dashboards/sundrift-product-traffic",
      summary: "Seeded Sundrift product traffic is ready.",
    };
  },
});
