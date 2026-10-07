/**
 * The database harness for Beam's integration tests.
 *
 * Strategy: a dedicated Postgres **database** (`beam_test` by default) on the
 * same server as the app, reached through the same `neon-http` driver and the
 * same Drizzle migrations. Tests therefore exercise real SQL — constraints,
 * partial indexes, trigram search, cascade rules — over the exact code path
 * production uses. Nothing is mocked and there is no second ORM.
 *
 * A separate database rather than a separate schema because the neon-http
 * driver ignores `options=-c search_path=...` in the connection string, so
 * schema scoping would silently fall back to `public` — that is, to real data.
 *
 * Isolation: neon-http is stateless per request, so interactive transactions
 * (BEGIN … ROLLBACK) are not available and rollback-per-test is impossible.
 * Tests reset by truncating every table in one statement instead, which is a
 * single round trip and keeps ordering irrelevant.
 */
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";

import * as schema from "../../drizzle/schema";

/** Databases we are willing to wipe. Anything else is treated as real data. */
const TEST_DATABASE_PATTERN = /(^|[_-])test($|[_-])|^beam_test$/;

const DEFAULT_TEST_DATABASE = "beam_test";

export type TestDatabase = NeonHttpDatabase<typeof schema>;

function swapDatabaseName(url: string, name: string): string {
  const parsed = new URL(url);
  parsed.pathname = "/" + name;
  return parsed.toString();
}

function databaseNameOf(url: string): string {
  return new URL(url).pathname.replace(/^\//, "");
}

/**
 * Resolves the URL the tests are allowed to destroy, and refuses anything that
 * does not look unmistakably like a test database.
 *
 * Explicit `DATABASE_URL_TEST` wins. Otherwise we derive one from the app's
 * direct connection by swapping only the database name, which keeps CI setup
 * to a single existing secret.
 */
export function resolveTestDatabaseUrl(env = process.env): string {
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to run database tests with NODE_ENV=production.",
    );
  }

  const explicit = env.DATABASE_URL_TEST;
  const base = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;

  if (!explicit && !base) {
    throw new Error(
      "Database tests need DATABASE_URL_TEST, or DATABASE_URL_UNPOOLED / " +
        "DATABASE_URL to derive one from. None are set.",
    );
  }

  const url = explicit ?? swapDatabaseName(base!, DEFAULT_TEST_DATABASE);
  const name = databaseNameOf(url);

  // The name is interpolated into `CREATE DATABASE`, so keep it to plain
  // identifier characters rather than relying on quoting alone.
  if (!/^[a-z0-9_]+$/i.test(name)) {
    throw new Error(`Test database name "${name}" is not a plain identifier.`);
  }

  if (!TEST_DATABASE_PATTERN.test(name)) {
    throw new Error(
      `Refusing to run destructive tests against database "${name}". ` +
        "The database name must identify it as a test database " +
        '(for example "beam_test"). Set DATABASE_URL_TEST explicitly.',
    );
  }

  // Guards against a DATABASE_URL_TEST that points at the app's own database.
  if (base && databaseNameOf(base) === name) {
    throw new Error(
      `DATABASE_URL_TEST points at "${name}", the same database the app uses.`,
    );
  }

  return url;
}

let cached: TestDatabase | undefined;
let migrated = false;

/** The real Drizzle connection, pointed at the test database. */
export function testDb(): TestDatabase {
  if (!cached) {
    cached = drizzle(neon(resolveTestDatabaseUrl()), { schema });
  }
  return cached;
}

/**
 * Creates the test database if it is missing. `CREATE DATABASE` cannot run
 * inside a transaction, which suits the HTTP driver's one-statement-per-request
 * model exactly.
 */
async function ensureDatabaseExists(): Promise<void> {
  const url = resolveTestDatabaseUrl();
  const name = databaseNameOf(url);
  const admin = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!admin) return;

  try {
    // The name is validated against TEST_DATABASE_PATTERN above, so it cannot
    // carry anything but word characters into this identifier.
    await neon(admin).query(`create database "${name}"`);
  } catch (error) {
    if (!/already exists/i.test((error as Error).message)) throw error;
  }
}

/**
 * Applies Beam's real migrations. Runs once per worker process; the migration
 * table makes repeat calls a no-op, so a stale schema surfaces as a migration
 * error rather than as a confusing test failure.
 */
export async function setupTestDatabase(): Promise<TestDatabase> {
  if (migrated) return testDb();
  await ensureDatabaseExists();
  await migrate(testDb(), { migrationsFolder: "./drizzle/migrations" });
  migrated = true;
  return testDb();
}

/**
 * Every table, ordered only for readability — `truncate ... cascade` in a
 * single statement makes dependency order irrelevant and restarts identities.
 */
const TABLES = [
  "notifications",
  "issue_subscribers",
  "favorites",
  "saved_views",
  "issue_relations",
  "activities",
  "comments",
  "issue_labels",
  "labels",
  "issues",
  "cycles",
  "milestones",
  "project_teams",
  "project_updates",
  "projects",
  "workflow_statuses",
  "team_members",
  "teams",
  "workspace_members",
  "members",
  "workspaces",
] as const;

/** Empties the test database. One round trip, safe to call between tests. */
export async function resetTestDatabase(): Promise<void> {
  await truncate(TABLES);
}

/**
 * The tables a typical write test dirties, leaving the workspace, teams,
 * statuses, projects and cycles in place.
 *
 * Seeding the fixture costs a dozen HTTP round trips, which dominates the run
 * when it happens per test. Suites that only create and mutate issues seed once
 * and call this between tests instead; suites that change structure (team
 * settings, cycles) still do a full reset.
 */
const VOLATILE_TABLES = [
  "notifications",
  "issue_subscribers",
  "favorites",
  "saved_views",
  "issue_relations",
  "activities",
  "comments",
  "issue_labels",
  "issues",
] as const;

export async function resetIssueData(): Promise<void> {
  await truncate(VOLATILE_TABLES);
}

/**
 * The Postgres error behind a failed write.
 *
 * Drizzle wraps driver errors in a "Failed query: ..." message that hides the
 * constraint name, so tests asserting that a real index did the rejecting need
 * the cause rather than the wrapper.
 */
export async function constraintViolation(
  write: Promise<unknown>,
): Promise<string> {
  try {
    await write;
  } catch (error) {
    const cause = (error as { cause?: unknown }).cause;
    return String((cause as Error)?.message ?? (error as Error).message);
  }
  throw new Error("Expected the write to be rejected, but it succeeded.");
}

async function truncate(tables: readonly string[]): Promise<void> {
  const list = tables.map((table) => `"${table}"`).join(", ");
  await testDb().execute(
    sql.raw(`truncate table ${list} restart identity cascade`),
  );
}
