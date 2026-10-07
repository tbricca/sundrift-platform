import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import {
  DEMO_SOURCE_LABEL,
  matchResearchKeyword,
} from "@sundrift/shared";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { presentResearch } from "../server/records.js";
import { ensureSeoSeed } from "../server/seed.js";

export default defineAction({
  description:
    "Start Sundrift SEO opportunity research for a product keyword and country. Uses the seeded catalog. Unknown keywords get a labeled illustrative stub, not a live Ahrefs call.",
  schema: z.object({
    keyword: z.string().min(1).describe("Product keyword, such as linen travel shirts"),
    country: z.string().default("US").describe("Country code, such as US"),
    request: z
      .string()
      .optional()
      .describe("The question merchandising asked"),
  }),
  http: { method: "POST" },
  run: async ({ keyword, country, request }) => {
    await ensureSeoSeed();
    const db = getDb();
    const normalizedCountry = country.trim().toUpperCase() || "US";
    const match = matchResearchKeyword(keyword);
    const lookupKeyword = match?.keyword ?? keyword.trim();
    const [existing] = await db
      .select()
      .from(schema.researchReports)
      .where(
        and(
          eq(schema.researchReports.keyword, lookupKeyword),
          eq(schema.researchReports.country, match?.country ?? normalizedCountry),
        ),
      )
      .limit(1);
    if (existing) {
      const research = presentResearch(existing);
      return {
        created: false,
        research,
        urlPath: research.urlPath,
        url: buildDeepLink({
          app: "seo",
          view: "report",
          to: research.urlPath,
          params: { researchId: research.id },
        }),
        message: `Research ready for ${research.keyword}.`,
      };
    }

    const now = new Date().toISOString();
    const id = match?.id ?? `research_${crypto.randomUUID().slice(0, 8)}`;
    const question =
      request?.trim() ||
      match?.request ||
      `What's the competition like for ${lookupKeyword}?`;
    await db.insert(schema.researchReports).values({
      id,
      keyword: lookupKeyword,
      country: normalizedCountry,
      request: question,
      volume: match?.volume ?? 0,
      keywordDifficulty: match?.keywordDifficulty ?? 0,
      researchedAt: now.slice(0, 10),
      sourceLabel: match ? DEMO_SOURCE_LABEL : "Illustrative stub",
      relatedJson: JSON.stringify(match?.related ?? []),
      serpJson: JSON.stringify(match?.serp ?? []),
      suggestedResponse: match?.suggestedResponse ?? "",
      fullReport:
        match?.fullReport ??
        `No catalog entry for ${lookupKeyword}. This stub is illustrative and is not a live keyword pull.`,
      productId: match?.productId ?? null,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.auditEntries).values({
      id: `audit_${id}`,
      channel: "SEO",
      team: "SEO",
      requestedAt: now.slice(0, 10),
      summary: question,
      detail: match
        ? "Started from the research form."
        : "Illustrative stub. The catalog does not have this keyword.",
      status: match ? "complete" : "open",
      researchId: id,
      mailboxMessageId: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    const research = await db
      .select()
      .from(schema.researchReports)
      .where(eq(schema.researchReports.id, id))
      .limit(1);
    const presented = presentResearch(research[0]);
    return {
      created: true,
      research: presented,
      urlPath: presented.urlPath,
      url: buildDeepLink({
        app: "seo",
        view: "report",
        to: presented.urlPath,
        params: { researchId: id },
      }),
      message: `Research ready for ${presented.keyword}.`,
    };
  },
});
