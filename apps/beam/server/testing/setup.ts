/**
 * Runs before any integration test module is imported.
 *
 * `server/db.ts` reads `DATABASE_URL` lazily and memoises the client, so
 * rewriting the variable here — before the first import of the app's own db
 * module — is what makes every action under test talk to the test database.
 * Nothing in the app is mocked or parameterised for tests.
 */
import { beforeAll } from "vitest";

import { resolveTestDatabaseUrl, setupTestDatabase } from "./database";

// Only DATABASE_URL is redirected. DATABASE_URL_UNPOOLED stays pointed at the
// app's own database: it is the admin connection `CREATE DATABASE` runs on,
// and it is what the guard compares against to prove the two differ.
process.env.DATABASE_URL = resolveTestDatabaseUrl();

beforeAll(async () => {
  await setupTestDatabase();
});
