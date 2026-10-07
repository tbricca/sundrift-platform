import {
  ensureAdditiveColumns,
  getDbExec,
  runMigrations,
} from "@agent-native/core/db";

import * as schema from "../db/schema.js";

function isDrizzleTable(value: unknown): value is object {
  return (
    !!value &&
    typeof value === "object" &&
    Object.getOwnPropertySymbols(value).some((symbol) =>
      symbol.toString().includes("drizzle"),
    )
  );
}

const schemaTables = Object.values(schema).filter(isDrizzleTable);

export const runSeoMigrations = runMigrations(
  [
    {
      version: 1,
      name: "seo-demo-tables",
      sql: `CREATE TABLE IF NOT EXISTS seo_research_reports (
  id TEXT PRIMARY KEY,
  keyword TEXT NOT NULL,
  country TEXT NOT NULL,
  request TEXT NOT NULL,
  volume INTEGER NOT NULL,
  keyword_difficulty INTEGER NOT NULL,
  researched_at TEXT NOT NULL,
  source_label TEXT NOT NULL,
  related_json TEXT NOT NULL,
  serp_json TEXT NOT NULL,
  suggested_response TEXT NOT NULL DEFAULT '',
  full_report TEXT NOT NULL DEFAULT '',
  product_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS seo_audit_entries (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  team TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  research_id TEXT,
  mailbox_message_id TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS seo_audit_requested_idx ON seo_audit_entries (requested_at);`,
    },
  ],
  { table: "seo_migrations" },
);

export default async (nitroApp: unknown): Promise<void> => {
  await runSeoMigrations(nitroApp);
  try {
    const summary = await ensureAdditiveColumns({
      db: getDbExec(),
      tables: schemaTables,
    });
    if (summary.errors.length > 0) {
      console.warn("[seo-db] additive column check:", summary.errors);
    }
  } catch (error) {
    console.warn(
      "[seo-db] additive column check failed:",
      error instanceof Error ? error.message : error,
    );
  }
};
