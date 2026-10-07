import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { DEMO_PRODUCTS, productById } from "@sundrift/shared";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getCampaign } from "../server/records.js";
import { ensureCampaignSeed } from "../server/seed.js";

const PRODUCT_HINTS: Array<[string, string]> = [
  ["packing cube", "packing-cubes"],
  ["weekender", "weekender"],
  ["linen", "linen-travel-shirts"],
  ["carry-on", "drift-carry-on"],
  ["carry on", "drift-carry-on"],
  ["drift", "drift-carry-on"],
  ["coast tote", "coast-tote"],
  ["tote", "coast-tote"],
  ["lounge", "care-plus-lounge"],
  ["care+", "care-plus-lounge"],
];

function matchProduct(text: string) {
  const query = text.toLowerCase();
  for (const [hint, id] of PRODUCT_HINTS) {
    if (query.includes(hint)) return productById(id) ?? DEMO_PRODUCTS[0];
  }
  return DEMO_PRODUCTS[0];
}

export default defineAction({
  description:
    "Create a Sundrift campaign from a name, product keywords, and description. Attaches the closest catalog product and opens the revenue simulator. Does not call a model.",
  schema: z.object({
    name: z.string().min(1),
    campaignKeywords: z.string().min(1),
    description: z.string().min(1),
  }),
  http: { method: "POST" },
  run: async ({ name, campaignKeywords, description }) => {
    await ensureCampaignSeed();
    const product = matchProduct(`${name} ${campaignKeywords} ${description}`);
    const now = new Date().toISOString();
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40);
    const id = `campaign_${slug || "new"}_${crypto.randomUUID().slice(0, 6)}`;
    await getDb().insert(schema.campaignPlans).values({
      id,
      name: name.trim(),
      productId: product.id,
      windowDays: 180,
      referenceDays: 180,
      sessionLiftPct: 0,
      conversionLiftPp: 0,
      aovLiftPct: 0,
      status: "active",
      comparableLabel: name.trim(),
      notes: description.trim(),
      category: product.category,
      campaignKeywords: campaignKeywords.trim(),
      description: description.trim(),
      createdAt: now,
      updatedAt: now,
    });
    const campaign = await getCampaign(id);
    if (!campaign) throw new Error("Campaign was not saved.");
    return {
      id: campaign.id,
      campaign,
      urlPath: campaign.urlPath,
      url: buildDeepLink({
        app: "campaign-planner",
        view: "campaign",
        to: campaign.urlPath,
        params: { campaignId: campaign.id },
      }),
      message: `Campaign ready for ${campaign.name}. Financial model uses the seeded ${product.name} snapshot.`,
    };
  },
});
