import {
  DEMO_AUDIT_ENTRIES,
  DEMO_RESEARCH,
  type DemoAuditEntry,
  type DemoResearch,
} from "@sundrift/shared";
import { eq } from "drizzle-orm";

import { getDb, schema } from "./db/index.js";

function researchValues(entry: DemoResearch, now: string) {
  return {
    id: entry.id,
    keyword: entry.keyword,
    country: entry.country,
    request: entry.request,
    volume: entry.volume,
    keywordDifficulty: entry.keywordDifficulty,
    researchedAt: entry.researchedAt,
    sourceLabel: entry.sourceLabel,
    relatedJson: JSON.stringify(entry.related),
    serpJson: JSON.stringify(entry.serp),
    suggestedResponse: entry.suggestedResponse,
    fullReport: entry.fullReport,
    productId: entry.productId,
    createdAt: now,
    updatedAt: now,
  };
}

function auditValues(entry: DemoAuditEntry, now: string) {
  return {
    id: entry.id,
    channel: entry.channel,
    team: entry.team,
    requestedAt: entry.requestedAt,
    summary: entry.summary,
    detail: entry.detail,
    status: entry.status,
    researchId: entry.researchId,
    mailboxMessageId: entry.mailboxMessageId,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function ensureSeoSeed(): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();
  await db
    .insert(schema.researchReports)
    .values(DEMO_RESEARCH.map((entry) => researchValues(entry, now)))
    .onConflictDoNothing();
  await db
    .insert(schema.auditEntries)
    .values(DEMO_AUDIT_ENTRIES.map((entry) => auditValues(entry, now)))
    .onConflictDoNothing();
}

export async function restoreMailboxImports(): Promise<number> {
  const db = getDb();
  const now = new Date().toISOString();
  let restored = 0;
  for (const entry of DEMO_AUDIT_ENTRIES) {
    if (!entry.mailboxMessageId) continue;
    const [existing] = await db
      .select()
      .from(schema.auditEntries)
      .where(eq(schema.auditEntries.id, entry.id))
      .limit(1);
    if (!existing) {
      await db.insert(schema.auditEntries).values(auditValues(entry, now));
      restored += 1;
      continue;
    }
    if (existing.deletedAt) {
      await db
        .update(schema.auditEntries)
        .set({ deletedAt: null, updatedAt: now, status: "open" })
        .where(eq(schema.auditEntries.id, entry.id));
      restored += 1;
    }
  }
  return restored;
}
