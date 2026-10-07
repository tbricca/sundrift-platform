import { asc, desc, eq, isNull } from "drizzle-orm";

import { getDb, schema } from "./db/index.js";
import { ensureSeoSeed } from "./seed.js";

type ResearchRow = typeof schema.researchReports.$inferSelect;
type AuditRow = typeof schema.auditEntries.$inferSelect;

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function presentResearch(row: ResearchRow) {
  return {
    id: row.id,
    keyword: row.keyword,
    country: row.country,
    request: row.request,
    volume: row.volume,
    keywordDifficulty: row.keywordDifficulty,
    researchedAt: row.researchedAt,
    sourceLabel: row.sourceLabel,
    related: parseJson(row.relatedJson, []),
    serp: parseJson(row.serpJson, []),
    suggestedResponse: row.suggestedResponse,
    fullReport: row.fullReport,
    productId: row.productId,
    urlPath: `/reports/${row.id}`,
    updatedAt: row.updatedAt,
  };
}

export function presentAudit(row: AuditRow) {
  return {
    id: row.id,
    channel: row.channel,
    team: row.team,
    requestedAt: row.requestedAt,
    summary: row.summary,
    detail: row.detail,
    status: row.status,
    researchId: row.researchId,
    mailboxMessageId: row.mailboxMessageId,
    deletedAt: row.deletedAt,
    urlPath: row.researchId
      ? `/reports/${row.researchId}`
      : `/audit-log?requestId=${row.id}`,
  };
}

export async function listResearch() {
  await ensureSeoSeed();
  const rows = await getDb()
    .select()
    .from(schema.researchReports)
    .orderBy(desc(schema.researchReports.researchedAt));
  return rows.map(presentResearch);
}

export async function getResearch(id: string) {
  await ensureSeoSeed();
  const [row] = await getDb()
    .select()
    .from(schema.researchReports)
    .where(eq(schema.researchReports.id, id))
    .limit(1);
  return row ? presentResearch(row) : null;
}

export async function listAuditLog() {
  await ensureSeoSeed();
  const rows = await getDb()
    .select()
    .from(schema.auditEntries)
    .where(isNull(schema.auditEntries.deletedAt))
    .orderBy(desc(schema.auditEntries.requestedAt), asc(schema.auditEntries.id));
  return rows.map(presentAudit);
}

export async function getAuditEntry(id: string) {
  await ensureSeoSeed();
  const [row] = await getDb()
    .select()
    .from(schema.auditEntries)
    .where(eq(schema.auditEntries.id, id))
    .limit(1);
  return row ? presentAudit(row) : null;
}
