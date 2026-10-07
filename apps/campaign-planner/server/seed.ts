import { DEMO_CAMPAIGNS } from "@sundrift/shared";
import { and, eq } from "drizzle-orm";

import { getDb, schema } from "./db/index.js";

export async function ensureCampaignSeed(): Promise<void> {
  const now = new Date().toISOString();
  const db = getDb();
  await db
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
        category: campaign.category,
        campaignKeywords: campaign.campaignKeywords,
        description: campaign.notes,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing();

  for (const campaign of DEMO_CAMPAIGNS) {
    await db
      .update(schema.campaignPlans)
      .set({
        category: campaign.category,
        campaignKeywords: campaign.campaignKeywords,
        description: campaign.notes,
      })
      .where(
        and(
          eq(schema.campaignPlans.id, campaign.id),
          eq(schema.campaignPlans.campaignKeywords, ""),
        ),
      );
  }
}
