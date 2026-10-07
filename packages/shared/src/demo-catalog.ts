/**
 * Sundrift conference-demo catalog.
 * Travel products, SEO research, mailbox requests, campaigns, and product-dev
 * stories. Numbers are a seeded snapshot so Campaign Planner and Analytics can
 * run without Ahrefs, Gmail, or a live traffic pipeline.
 */

export type DemoProduct = {
  id: string;
  sku: string;
  name: string;
  category: string;
  blurb: string;
  sessions: number;
  conversionPct: number;
  aov: number;
  windowDays: number;
};

export type DemoRelatedTerm = {
  keyword: string;
  difficulty: number;
  volume: number;
};

export type DemoSerpRow = {
  name: string;
  position: number;
  traffic: number;
  domainRating: number;
};

export type DemoResearch = {
  id: string;
  productId: string;
  keyword: string;
  country: string;
  request: string;
  volume: number;
  keywordDifficulty: number;
  researchedAt: string;
  sourceLabel: string;
  related: DemoRelatedTerm[];
  serp: DemoSerpRow[];
  suggestedResponse: string;
  fullReport: string;
};

export type DemoAuditEntry = {
  id: string;
  channel: "SEO" | "Email";
  team: string;
  requestedAt: string;
  summary: string;
  detail: string;
  status: "open" | "complete";
  researchId: string | null;
  mailboxMessageId: string | null;
};

export type DemoCampaign = {
  id: string;
  name: string;
  productId: string;
  windowDays: number;
  referenceDays: number;
  sessionLiftPct: number;
  conversionLiftPp: number;
  aovLiftPct: number;
  status: "active" | "complete";
  comparableLabel: string;
  notes: string;
};

export type DemoProductDevStory = {
  id: string;
  prdId: string;
  prdTitle: string;
  beamTitle: string;
  planSectionTitle: string;
  summary: string;
  prdMarkdown: string;
};

export const DEMO_SOURCE_LABEL = "Ahrefs-style catalog";
export const DEMO_WINDOW_DAYS = 180;

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: "weekender",
    sku: "WKND-001",
    name: "The Weekender",
    category: "Bags",
    blurb: "Soft duffel for two or three nights.",
    sessions: 9421,
    conversionPct: 4.52,
    aov: 52.37,
    windowDays: DEMO_WINDOW_DAYS,
  },
  {
    id: "packing-cubes",
    sku: "CUBE-4",
    name: "Packing cubes",
    category: "Organization",
    blurb: "Compression cubes sized for the Drift Carry-On.",
    sessions: 14880,
    conversionPct: 3.1,
    aov: 28,
    windowDays: DEMO_WINDOW_DAYS,
  },
  {
    id: "linen-travel-shirts",
    sku: "LINEN-TS",
    name: "Linen travel shirts",
    category: "Apparel",
    blurb: "Breathable shirts that pack flat and shake out.",
    sessions: 4102,
    conversionPct: 3.8,
    aov: 68,
    windowDays: DEMO_WINDOW_DAYS,
  },
  {
    id: "care-plus-lounge",
    sku: "CARE-LOUNGE",
    name: "Care+ lounge",
    category: "Membership",
    blurb: "Member lounge access on travel days.",
    sessions: 1860,
    conversionPct: 6.9,
    aov: 24,
    windowDays: DEMO_WINDOW_DAYS,
  },
  {
    id: "drift-carry-on",
    sku: "DRIFT-35",
    name: "The Drift Carry-On",
    category: "Luggage",
    blurb: "35L spinner sized for most overhead bins.",
    sessions: 6204,
    conversionPct: 2.4,
    aov: 198,
    windowDays: DEMO_WINDOW_DAYS,
  },
  {
    id: "coast-tote",
    sku: "COAST-TOTE",
    name: "The Coast Tote",
    category: "Bags",
    blurb: "Everyday tote that slides under a seat.",
    sessions: 5330,
    conversionPct: 3.4,
    aov: 86,
    windowDays: DEMO_WINDOW_DAYS,
  },
];

const linenReport = `Opportunity research for linen travel shirts in the United States.

Search demand is modest and the difficulty score is low, which is unusual for apparel-adjacent travel gear. The useful queries are specific: breathable travel shirts, wrinkle-resistant linen, and shirts that pack flat. Broad "linen shirt" demand belongs to fashion retailers and is a poor fit for Sundrift.

Harbor Supply holds a strong position with a high domain rating. Northline Travel and Fieldnote Co. rank with thinner pages that lean on materials, not trips. A Sundrift page can win the travel-specific queries by leading with packing, wrinkle recovery, and what to wear on a two-night trip with The Weekender.

Recommended response: publish a product guide for linen travel shirts, answer the packing and wrinkle questions in the first screen, and link the Drift Carry-On and packing cubes as the kit around the shirt. Do not chase the unbranded fashion head term.`;

const weekenderReport = `Opportunity research for weekender bags in the United States.

Volume is healthy and difficulty is moderate. The intent splits between soft duffels for two or three nights and larger weekend luggage. Sundrift's Weekender is the soft duffel, so the page should say that plainly and show what fits: linen travel shirts, packing cubes, and a pair of shoes.

Harbor Supply ranks with a comparison roundup. Northline Travel ranks a category page. Fieldnote Co. ranks an editorial gift guide. A campaign landing page for long-weekend layering can target the trip use case without competing as a generic bag directory.`;

const cubesReport = `Opportunity research for packing cubes in the United States.

This is the highest-volume term in the seeded set and the hardest. Shoppers compare cube count, compression, and whether the set fits a carry-on. Sundrift should anchor the page to the Drift Carry-On interior, not a generic organizer claim.

Related demand includes compression packing cubes and carry-on packing cubes. Those are better landing targets than the head term alone. Pair the page with the shoulder-season email that features the cube set.`;

export const DEMO_RESEARCH: DemoResearch[] = [
  {
    id: "research_linen_travel_shirts",
    productId: "linen-travel-shirts",
    keyword: "linen travel shirts",
    country: "US",
    request: "What's the competition like for linen travel shirts?",
    volume: 9800,
    keywordDifficulty: 0,
    researchedAt: "2026-09-29",
    sourceLabel: DEMO_SOURCE_LABEL,
    related: [
      { keyword: "linen shirt for travel", difficulty: 2, volume: 2400 },
      { keyword: "breathable travel shirt", difficulty: 5, volume: 1600 },
      { keyword: "wrinkle resistant linen shirt", difficulty: 4, volume: 880 },
    ],
    serp: [
      { name: "Harbor Supply", position: 2, traffic: 1339, domainRating: 83 },
      { name: "Northline Travel", position: 4, traffic: 640, domainRating: 54 },
      { name: "Fieldnote Co.", position: 6, traffic: 410, domainRating: 47 },
    ],
    suggestedResponse:
      "Linen travel shirts are a low-difficulty opening. Answer packing and wrinkle recovery first, and leave the broad fashion query to apparel retailers. Link The Weekender and packing cubes as the trip kit.",
    fullReport: linenReport,
  },
  {
    id: "research_weekender_bags",
    productId: "weekender",
    keyword: "weekender bags",
    country: "US",
    request: "How crowded is weekender bag search, and where can Sundrift fit?",
    volume: 12100,
    keywordDifficulty: 8,
    researchedAt: "2026-09-14",
    sourceLabel: DEMO_SOURCE_LABEL,
    related: [
      { keyword: "weekend duffel bag", difficulty: 11, volume: 3600 },
      { keyword: "soft weekender luggage", difficulty: 7, volume: 1400 },
      { keyword: "carry on duffel", difficulty: 14, volume: 2900 },
    ],
    serp: [
      { name: "Harbor Supply", position: 1, traffic: 2104, domainRating: 83 },
      { name: "Northline Travel", position: 3, traffic: 980, domainRating: 54 },
      { name: "Fieldnote Co.", position: 5, traffic: 520, domainRating: 47 },
    ],
    suggestedResponse:
      "Lead with the two-or-three-night duffel, not a luggage directory. A long-weekend landing page can sit next to the Midwest layering campaign.",
    fullReport: weekenderReport,
  },
  {
    id: "research_packing_cubes",
    productId: "packing-cubes",
    keyword: "packing cubes",
    country: "US",
    request: "Where should packing cubes show up against carry-on search?",
    volume: 22200,
    keywordDifficulty: 18,
    researchedAt: "2026-09-29",
    sourceLabel: DEMO_SOURCE_LABEL,
    related: [
      { keyword: "compression packing cubes", difficulty: 16, volume: 5400 },
      { keyword: "carry on packing cubes", difficulty: 12, volume: 3100 },
      { keyword: "packing cubes for spinner", difficulty: 9, volume: 720 },
    ],
    serp: [
      { name: "Harbor Supply", position: 1, traffic: 4020, domainRating: 83 },
      { name: "Fieldnote Co.", position: 3, traffic: 1180, domainRating: 47 },
      { name: "Northline Travel", position: 7, traffic: 390, domainRating: 54 },
    ],
    suggestedResponse:
      "Treat packing cubes as a carry-on fit story for the Drift Carry-On. The head term is crowded; compression and carry-on modifiers are the pages worth writing.",
    fullReport: cubesReport,
  },
];

export const DEMO_AUDIT_ENTRIES: DemoAuditEntry[] = [
  {
    id: "audit_fleece_layer",
    channel: "Email",
    team: "Merchandising",
    requestedAt: "2026-09-29",
    summary: "Feature packing cubes in the shoulder-season travel email",
    detail:
      "Mailbox import. Merchandising wants the cube set in the shoulder-season send, with a link to the Drift Carry-On fit notes. Seeded message, not a live Gmail thread.",
    status: "open",
    researchId: "research_packing_cubes",
    mailboxMessageId: "mail_shoulder_cubes",
  },
  {
    id: "audit_holiday_weekender",
    channel: "Email",
    team: "Retail Marketing",
    requestedAt: "2026-09-29",
    summary: "Holiday landing page for The Weekender",
    detail:
      "Mailbox import. Retail marketing asked for a holiday landing page that keeps the long-weekend story and does not turn The Weekender into a generic gift guide.",
    status: "open",
    researchId: "research_weekender_bags",
    mailboxMessageId: "mail_holiday_weekender",
  },
  {
    id: "audit_linen_sep29",
    channel: "SEO",
    team: "SEO",
    requestedAt: "2026-09-29",
    summary: "What's the competition like for linen travel shirts?",
    detail:
      "Opportunity research finished. Suggested response is ready to edit or hand to the agent.",
    status: "complete",
    researchId: "research_linen_travel_shirts",
    mailboxMessageId: null,
  },
  {
    id: "audit_weekender_sep14",
    channel: "SEO",
    team: "SEO",
    requestedAt: "2026-09-14",
    summary: "How crowded is weekender bag search, and where can Sundrift fit?",
    detail: "Earlier research pass for The Weekender. Linked report is seeded.",
    status: "complete",
    researchId: "research_weekender_bags",
    mailboxMessageId: null,
  },
];

export const DEMO_CAMPAIGNS: DemoCampaign[] = [
  {
    id: "campaign_weekender_midwest",
    name: "Weekenders — Long Weekend Layering — Midwest",
    productId: "weekender",
    windowDays: 180,
    referenceDays: 180,
    sessionLiftPct: 12.4,
    conversionLiftPp: 1.6,
    aovLiftPct: 3.9,
    status: "active",
    comparableLabel: "Weekenders — Long Weekend Layering — Midwest",
    notes:
      "Hero case. Baseline is the seeded Weekender snapshot for the last 180 days.",
  },
  {
    id: "campaign_packing_cubes",
    name: "Packing cubes — Carry-on fit",
    productId: "packing-cubes",
    windowDays: 180,
    referenceDays: 180,
    sessionLiftPct: 8,
    conversionLiftPp: 0.4,
    aovLiftPct: 2.1,
    status: "active",
    comparableLabel: "Packing cubes — spring organization push",
    notes: "Secondary campaign. Same window, smaller lift.",
  },
  {
    id: "campaign_drift_carry_on",
    name: "Drift Carry-On — Overhead bin",
    productId: "drift-carry-on",
    windowDays: 180,
    referenceDays: 180,
    sessionLiftPct: 6.5,
    conversionLiftPp: 0.8,
    aovLiftPct: 1.2,
    status: "active",
    comparableLabel: "Drift Carry-On — bin-size education",
    notes: "Spinner story. Higher AOV, lower session base.",
  },
];

export const DEMO_PRODUCT_DEV: DemoProductDevStory[] = [
  {
    id: "loyalty",
    prdId: "prd_loyalty",
    prdTitle: "PRD: Care+ lounge loyalty nights",
    beamTitle: "Loyalty: member nights at Care+ lounge",
    planSectionTitle: "Loyalty nights",
    summary:
      "Members earn a Care+ lounge night after a Weekender or Drift Carry-On purchase.",
    prdMarkdown: `# Care+ lounge loyalty nights

## Problem
Travelers who buy a bag from Sundrift have no reason to come back before the next trip. Care+ lounge is a same-day benefit, and it is easy to forget after checkout.

## Proposal
Award one lounge night when an order includes The Weekender or The Drift Carry-On. Show the night in the order confirmation and again three days before the trip date the shopper saved.

## Scope
- Earn rule: one night per qualifying bag, not per packing cube or shirt.
- Redemption: a single Care+ lounge visit, booked in the existing membership flow.
- Out of scope: points, tiers, and paid lounge upgrades.

## Success
A member can see the earned night without emailing support. Support can explain the rule in one sentence.`,
  },
  {
    id: "packing-ai",
    prdId: "prd_packing_ai",
    prdTitle: "PRD: Packing AI for the Drift Carry-On",
    beamTitle: "Packing AI: cube layout for the Drift Carry-On",
    planSectionTitle: "Packing AI",
    summary:
      "Suggest a cube layout for the 35L Drift Carry-On from a short packing list.",
    prdMarkdown: `# Packing AI for the Drift Carry-On

## Problem
Shoppers ask whether a two-night list fits the 35L spinner. The answer today is a size chart, not a layout.

## Proposal
Given a short list (shirts, cubes, shoes, toiletries), suggest a cube layout that fits the Drift Carry-On. The agent drafts the layout in chat. The page only saves the list and the chosen layout.

## Scope
- Inputs: trip length, climate, and a checklist.
- Output: which packing cubes to use and what stays loose.
- The model call stays in the app agent. The save action stores the list only.

## Success
A shopper can pack a two-night list without exceeding the carry-on interior.`,
  },
  {
    id: "returns",
    prdId: "prd_returns",
    prdTitle: "PRD: Prepaid returns for Weekender and Coast Tote",
    beamTitle: "Returns: prepaid labels for Weekender and Coast Tote",
    planSectionTitle: "Returns",
    summary:
      "Prepaid return labels for The Weekender and The Coast Tote, with packing cubes restocked on receipt.",
    prdMarkdown: `# Prepaid returns

## Problem
Soft bags come back without a label, and the cube set is often missing from the return, so restock is slow.

## Proposal
Offer a prepaid label for The Weekender and The Coast Tote. Ask whether packing cubes are in the box. On receipt, restock the bag and the cubes separately.

## Scope
- Labels for those two SKUs only in this pass.
- Linen travel shirts keep the existing apparel return window.
- No live carrier account in the demo. The label action records the request.

## Success
A return record names the SKU, whether cubes were included, and the restock state.`,
  },
];

export const DEMO_PLAN_ID = "plan-sundrift-product-dev";
export const DEMO_PLAN_TITLE = "Sundrift product development";
export const DEMO_PLAN_BRIEF =
  "Loyalty nights, packing layouts, and prepaid returns for the travel catalog.";

export const DEMO_COUNTRIES = ["US", "CA", "GB", "AU", "DE"] as const;

const KEYWORD_ALIASES: Record<string, string> = {
  "linen shirts": "linen-travel-shirts",
  "linen shirt": "linen-travel-shirts",
  "linen travel shirt": "linen-travel-shirts",
  "linen travel shirts": "linen-travel-shirts",
  weekender: "weekender",
  "weekender bag": "weekender",
  "weekender bags": "weekender",
  "the weekender": "weekender",
  "packing cube": "packing-cubes",
  "packing cubes": "packing-cubes",
  "care+": "care-plus-lounge",
  "care plus": "care-plus-lounge",
  "care+ lounge": "care-plus-lounge",
  "carry-on": "drift-carry-on",
  "carry on": "drift-carry-on",
  "drift carry-on": "drift-carry-on",
  "the drift carry-on": "drift-carry-on",
  "coast tote": "coast-tote",
  "the coast tote": "coast-tote",
};

export function normalizeDemoText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function productById(id: string): DemoProduct | undefined {
  return DEMO_PRODUCTS.find((product) => product.id === id);
}

export function matchResearchKeyword(keyword: string): DemoResearch | undefined {
  const normalized = normalizeDemoText(keyword);
  const direct = DEMO_RESEARCH.find(
    (entry) => normalizeDemoText(entry.keyword) === normalized,
  );
  if (direct) return direct;
  const productId = KEYWORD_ALIASES[normalized];
  if (!productId) return undefined;
  return DEMO_RESEARCH.find((entry) => entry.productId === productId);
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export type RevenueSimulationInput = {
  baselineSessions: number;
  baselineConversionPct: number;
  baselineAov: number;
  referenceDays: number;
  windowDays: number;
  sessionLiftPct: number;
  conversionLiftPp: number;
  aovLiftPct: number;
};

export type RevenueSimulation = {
  baselineSessions: number;
  simulatedSessions: number;
  baselineConversionPct: number;
  simulatedConversionPct: number;
  baselineAov: number;
  simulatedAov: number;
  baselineRevenue: number;
  simulatedRevenue: number;
  sessionLiftPct: number;
  conversionLiftPp: number;
  aovLiftPct: number;
  windowDays: number;
};

export function simulateRevenue(input: RevenueSimulationInput): RevenueSimulation {
  const referenceDays = input.referenceDays > 0 ? input.referenceDays : 1;
  const scale = input.windowDays / referenceDays;
  const baselineSessions = Math.round(input.baselineSessions * scale);
  const simulatedSessions = Math.round(
    baselineSessions * (1 + input.sessionLiftPct / 100),
  );
  const simulatedConversionPct = roundMoney(
    input.baselineConversionPct + input.conversionLiftPp,
  );
  const simulatedAov = roundMoney(
    input.baselineAov * (1 + input.aovLiftPct / 100),
  );
  const baselineRevenue = roundMoney(
    baselineSessions * (input.baselineConversionPct / 100) * input.baselineAov,
  );
  const simulatedRevenue = roundMoney(
    simulatedSessions * (simulatedConversionPct / 100) * simulatedAov,
  );
  return {
    baselineSessions,
    simulatedSessions,
    baselineConversionPct: input.baselineConversionPct,
    simulatedConversionPct,
    baselineAov: input.baselineAov,
    simulatedAov,
    baselineRevenue,
    simulatedRevenue,
    sessionLiftPct: input.sessionLiftPct,
    conversionLiftPp: input.conversionLiftPp,
    aovLiftPct: input.aovLiftPct,
    windowDays: input.windowDays,
  };
}

export function simulateCampaign(
  campaign: DemoCampaign,
  windowDays = campaign.windowDays,
): RevenueSimulation | null {
  const product = productById(campaign.productId);
  if (!product) return null;
  return simulateRevenue({
    baselineSessions: product.sessions,
    baselineConversionPct: product.conversionPct,
    baselineAov: product.aov,
    referenceDays: campaign.referenceDays,
    windowDays,
    sessionLiftPct: campaign.sessionLiftPct,
    conversionLiftPp: campaign.conversionLiftPp,
    aovLiftPct: campaign.aovLiftPct,
  });
}

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function demoPlanMarkdown(): string {
  const sections = DEMO_PRODUCT_DEV.map(
    (story) =>
      `## ${story.planSectionTitle}\n\n${story.summary}\n\n- Content PRD: /content/page/${story.prdId}\n- Beam ticket title: ${story.beamTitle}`,
  );
  return `# ${DEMO_PLAN_TITLE}\n\n${DEMO_PLAN_BRIEF}\n\n${sections.join("\n\n")}\n`;
}
