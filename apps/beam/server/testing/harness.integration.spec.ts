import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { issues, teams, workspaces } from "../../drizzle/schema";

import { resetTestDatabase, resolveTestDatabaseUrl, testDb } from "./database";
import { createTestIssue, resetIssueCounter, seedTestWorkspace } from "./fixtures";

describe("test database safety guard", () => {
  const base = "postgres://u:p@host/main";

  it("refuses a database that is not named like a test database", () => {
    expect(() =>
      resolveTestDatabaseUrl({ DATABASE_URL_TEST: base } as NodeJS.ProcessEnv),
    ).toThrow(/must identify it as a test database/i);
  });

  it("refuses to reuse the application database", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        DATABASE_URL_UNPOOLED: "postgres://u:p@host/beam_test",
        DATABASE_URL_TEST: "postgres://u:p@host/beam_test",
      } as NodeJS.ProcessEnv),
    ).toThrow(/same database the app uses/i);
  });

  it("refuses to run in production", () => {
    expect(() =>
      resolveTestDatabaseUrl({
        NODE_ENV: "production",
        DATABASE_URL_TEST: "postgres://u:p@host/beam_test",
      } as NodeJS.ProcessEnv),
    ).toThrow(/production/i);
  });

  it("refuses when nothing is configured", () => {
    expect(() => resolveTestDatabaseUrl({} as NodeJS.ProcessEnv)).toThrow(
      /DATABASE_URL_TEST/,
    );
  });

  it("derives a test database from the app connection", () => {
    const url = resolveTestDatabaseUrl({
      DATABASE_URL_UNPOOLED: base,
    } as NodeJS.ProcessEnv);
    expect(new URL(url).pathname).toBe("/beam_test");
  });

  it("accepts an explicitly named test database", () => {
    expect(
      resolveTestDatabaseUrl({
        DATABASE_URL_UNPOOLED: base,
        DATABASE_URL_TEST: "postgres://u:p@host/ci_test",
      } as NodeJS.ProcessEnv),
    ).toBe("postgres://u:p@host/ci_test");
  });
});

describe("harness", () => {
  beforeEach(async () => {
    await resetTestDatabase();
    resetIssueCounter();
  });

  it("runs against a database whose name marks it as disposable", () => {
    expect(new URL(resolveTestDatabaseUrl()).pathname).toMatch(/test/);
  });

  it("seeds the canonical workspace", async () => {
    const fixture = await seedTestWorkspace();

    expect(fixture.eng.key).toBe("ENG");
    expect(Object.keys(fixture.eng.status)).toHaveLength(5);

    const teamRows = await testDb()
      .select()
      .from(teams)
      .where(eq(teams.workspaceId, fixture.workspaceId));
    expect(teamRows).toHaveLength(2);
  });

  it("leaves no rows behind between tests", async () => {
    // The previous test seeded a workspace; beforeEach must have cleared it.
    expect(await testDb().select().from(workspaces)).toHaveLength(0);
    expect(await testDb().select().from(issues)).toHaveLength(0);
  });

  it("creates issues with stable per-test numbering", async () => {
    const fixture = await seedTestWorkspace();
    const first = await createTestIssue(fixture.eng);
    const second = await createTestIssue(fixture.eng);

    expect(first.identifierNumber).toBe(1);
    expect(second.identifierNumber).toBe(2);
    expect(first.teamId).toBe(fixture.eng.id);
  });
});
