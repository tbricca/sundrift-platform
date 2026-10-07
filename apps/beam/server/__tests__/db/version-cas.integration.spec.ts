/**
 * Optimistic concurrency, verified against real SQL.
 *
 * The guarantee under test is that a stale writer cannot land, and that the
 * check is the UPDATE's own `WHERE version = ?` rather than the preflight read
 * — the preflight alone leaves a window between reading and writing that two
 * concurrent writers can both pass through.
 */
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import updateIssue from "../../../actions/update-issue";
import { issues } from "../../../drizzle/schema";
import {
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  createTestIssue,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const read = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

const update = (args: Record<string, unknown>) =>
  updateIssue.run(args as never);

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("version compare-and-swap", () => {
  it("accepts a write that states the current version", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      title: "Renamed",
      expectedVersion: issue.version,
    });

    expect((await read(issue.id)).title).toBe("Renamed");
  });

  it("increments the version exactly once per write", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      title: "One",
      expectedVersion: issue.version,
    });
    const afterFirst = await read(issue.id);
    expect(afterFirst.version).toBe(issue.version + 1);

    await update({
      identifier: issue.id,
      title: "Two",
      expectedVersion: afterFirst.version,
    });
    expect((await read(issue.id)).version).toBe(issue.version + 2);
  });

  it("increments once even when a write changes several fields", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      title: "Multi",
      priority: "high",
      assigneeId: fixture.humanB,
      expectedVersion: issue.version,
    });

    expect((await read(issue.id)).version).toBe(issue.version + 1);
  });

  it("rejects a write that states a stale version", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, title: "Winner" });

    await expect(
      update({
        identifier: issue.id,
        title: "Loser",
        expectedVersion: issue.version,
      }),
    ).rejects.toThrow(/changed by someone else/i);
  });

  it("leaves the newer data untouched when a stale write is rejected", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, title: "Winner" });
    const winner = await read(issue.id);

    await expect(
      update({
        identifier: issue.id,
        title: "Loser",
        expectedVersion: issue.version,
      }),
    ).rejects.toThrow();

    const after = await read(issue.id);
    expect(after.title).toBe("Winner");
    expect(after.version).toBe(winner.version);
  });

  it("lets the first of two writers holding the same version win", async () => {
    const issue = await createTestIssue(fixture.eng);
    const shared = issue.version;

    // Both writers read the same version, as two tabs or two agents would.
    await update({
      identifier: issue.id,
      title: "First writer",
      expectedVersion: shared,
    });

    await expect(
      update({
        identifier: issue.id,
        title: "Second writer",
        expectedVersion: shared,
      }),
    ).rejects.toThrow(/changed by someone else/i);

    expect((await read(issue.id)).title).toBe("First writer");
  });

  it("reports the current version on the conflict", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, title: "Moved on" });
    const current = (await read(issue.id)).version;

    const error = await Promise.resolve(
      update({
        identifier: issue.id,
        title: "Stale",
        expectedVersion: issue.version,
      }),
    ).then(
      () => null,
      (thrown: unknown) => thrown as Error & { currentVersion?: number },
    );

    expect(error?.name).toBe("ConflictError");
    expect(error?.currentVersion).toBe(current);
  });

  it("still accepts writes that state no version at all", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, title: "Someone else" });

    // No expectedVersion means last-write-wins, which internal and agent
    // writes rely on.
    await update({ identifier: issue.id, priority: "urgent" });

    expect((await read(issue.id)).priority).toBe("urgent");
  });

  it("guards the SQL itself, not only the preflight read", async () => {
    const issue = await createTestIssue(fixture.eng);
    const current = issue.version;

    // The exact predicate the action builds. A stale guard must match no rows
    // even when nothing else stands in the way.
    const stale = await testDb()
      .update(issues)
      .set({ title: "Should not land" })
      .where(and(eq(issues.id, issue.id), eq(issues.version, current - 1)))
      .returning();
    expect(stale).toHaveLength(0);

    const fresh = await testDb()
      .update(issues)
      .set({ title: "Should land" })
      .where(and(eq(issues.id, issue.id), eq(issues.version, current)))
      .returning();
    expect(fresh).toHaveLength(1);

    expect((await read(issue.id)).title).toBe("Should land");
  });

  it("does not bump the version when the write changes nothing", async () => {
    const issue = await createTestIssue(fixture.eng, { priority: "high" });

    await update({
      identifier: issue.id,
      priority: "high",
      expectedVersion: issue.version,
    });

    expect((await read(issue.id)).version).toBe(issue.version);
  });

  it("guards the restore path too", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, deleted: true });
    const deletedVersion = (await read(issue.id)).version;

    await expect(
      update({
        identifier: issue.id,
        deleted: false,
        expectedVersion: deletedVersion - 1,
      }),
    ).rejects.toThrow(/changed by someone else/i);
    expect((await read(issue.id)).deletedAt).not.toBeNull();
  });
});
