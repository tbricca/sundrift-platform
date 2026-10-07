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

export const runCampaignMigrations = runMigrations(
  [
    {
      version: 1,
      name: "campaign-planner-demo-tables",
      sql: `CREATE TABLE IF NOT EXISTS campaign_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  product_id TEXT NOT NULL,
  window_days INTEGER NOT NULL,
  reference_days INTEGER NOT NULL,
  session_lift_pct DOUBLE PRECISION NOT NULL,
  conversion_lift_pp DOUBLE PRECISION NOT NULL,
  aov_lift_pct DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  comparable_label TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`,
    },
  ],
  { table: "campaign_planner_migrations" },
);

export default async (nitroApp: unknown): Promise<void> => {
  await runCampaignMigrations(nitroApp);
  try {
    const summary = await ensureAdditiveColumns({
      db: getDbExec(),
      tables: schemaTables,
    });
    if (summary.errors.length > 0) {
      console.warn("[campaign-db] additive column check:", summary.errors);
    }
  } catch (error) {
    console.warn(
      "[campaign-db] additive column check failed:",
      error instanceof Error ? error.message : error,
    );
  }
};
