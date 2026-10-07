import { DEMO_CAMPAIGNS } from "@sundrift/shared";

import { getDb, schema } from "./db/index.js";

export async function ensureCampaignSeed(): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .insert(schema.campaignPlans)
    .values(
      DEMO_CAMPAIGNS.map((campaign) => ({
        id: campaign.id,
        name: campaign.name,
        productId: campaign.productId,
        windowDays: campaign.windowDays,
        referenceDays: campaign.referenceDays,
        sessionLiftPct: campaign.sessionLiftPct,
        conversionLiftPp: campaign.conversionLiftPp,
        aovLiftPct: campaign.aovLiftPct,
        status: campaign.status,
        comparableLabel: campaign.comparableLabel,
        notes: campaign.notes,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();
}
