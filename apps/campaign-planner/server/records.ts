import {
  productById,
  simulateRevenue,
  type RevenueSimulation,
} from "@sundrift/shared";
import { desc, eq } from "drizzle-orm";

import { getDb, schema } from "./db/index.js";
import { ensureCampaignSeed } from "./seed.js";

type CampaignRow = typeof schema.campaignPlans.$inferSelect;

export function presentCampaign(row: CampaignRow) {
  const product = productById(row.productId);
  const sessionLiftPct = Number(row.sessionLiftPct);
  const conversionLiftPp = Number(row.conversionLiftPp);
  const aovLiftPct = Number(row.aovLiftPct);
  const windowDays = Number(row.windowDays);
  const referenceDays = Number(row.referenceDays);
  const simulation: RevenueSimulation | null = product
    ? simulateRevenue({
        baselineSessions: product.sessions,
        baselineConversionPct: product.conversionPct,
        baselineAov: product.aov,
        referenceDays,
        windowDays,
        sessionLiftPct,
        conversionLiftPp,
        aovLiftPct,
      })
    : null;
  return {
    id: row.id,
    name: row.name,
    productId: row.productId,
    productName: product?.name ?? row.productId,
    productBlurb: product?.blurb ?? "",
    productSessions: product?.sessions ?? 0,
    productConversionPct: product?.conversionPct ?? 0,
    productAov: product?.aov ?? 0,
    windowDays,
    referenceDays,
    sessionLiftPct,
    conversionLiftPp,
    aovLiftPct,
    status: row.status,
    workflowStatus: row.status === "complete" ? "completed" : "reviewing",
    comparableLabel: row.comparableLabel,
    notes: row.notes,
    category: row.category || product?.category || "Travel",
    campaignKeywords: row.campaignKeywords || product?.name || "",
    description: row.description || row.notes,
    stages: {
      marketResearch: false,
      financialModeling: true,
      brandMessaging: false,
      seo: true,
      buildPrototypes: false,
      reviewDesign: false,
      deploy: row.status === "complete",
    },
    badge: "Analytics + local campaign history",
    simulation,
    urlPath: `/campaign/${row.id}`,
  };
}

export async function listCampaigns() {
  await ensureCampaignSeed();
  const rows = await getDb()
    .select()
    .from(schema.campaignPlans)
    .orderBy(desc(schema.campaignPlans.updatedAt));
  return rows.map(presentCampaign);
}

export async function getCampaign(id: string) {
  await ensureCampaignSeed();
  const [row] = await getDb()
    .select()
    .from(schema.campaignPlans)
    .where(eq(schema.campaignPlans.id, id))
    .limit(1);
  return row ? presentCampaign(row) : null;
}
