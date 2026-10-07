/**
 * Bulk editing is deliberately non-atomic: each issue goes through the same
 * `update-issue` path, and one rejection must not roll back the issues that
 * already succeeded. These tests pin that contract down, because the opposite
 * behaviour would look equally "reasonable" to a future change.
 */
import { eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import bulkUpdate from "../../../actions/bulk-update-issues";
import { cycles, issueLabels, issues } from "../../../drizzle/schema";
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

const bulk = (args: Record<string, unknown>) => bulkUpdate.run(args as never);

const read = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

const labelsOf = async (id: string) =>
  (
    await testDb()
      .select()
      .from(issueLabels)
      .where(eq(issueLabels.issueId, id))
  )
    .map((row) => row.labelId)
    .sort();

/**
 * `cycleTarget` resolves against the wall clock inside `cycleState`, so those
 * cases need cycles positioned around the real present rather than the
 * fixture's fixed date.
 */
async function liveCycles(teamId: string, numbers: [number, number]) {
  const now = Date.now();
  const day = 86_400_000;
  const [active, upcoming] = numbers;
  const rows = await testDb()
    .insert(cycles)
    .values([
      {
        teamId,
        number: active,
        startsAt: new Date(now - day),
        endsAt: new Date(now + day),
        status: "active",
      },
      {
        teamId,
        number: upcoming,
        startsAt: new Date(now + 2 * day),
        endsAt: new Date(now + 16 * day),
        status: "upcoming",
      },
    ])
    .returning();
  return { active: rows[0], upcoming: rows[1] };
}

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  await testDb().delete(cycles).where(inArray(cycles.number, [10, 11, 20, 21]));
  resetIssueCounter();
});

describe("all-valid selections", () => {
  it("applies the patch to every issue", async () => {
    const one = await createTestIssue(fixture.eng);
    const two = await createTestIssue(fixture.eng);

    const result = await bulk({
      issueIds: [one.id, two.id],
      statusId: fixture.eng.status.doing,
      priority: "high",
    });

    expect(result.updatedCount).toBe(2);
    expect(result.failed).toEqual([]);
    expect((await read(one.id)).statusId).toBe(fixture.eng.status.doing);
    expect((await read(two.id)).priority).toBe("high");
  });

  it("adds labels without disturbing labels an issue already has", async () => {
    const issue = await createTestIssue(fixture.eng);
    await testDb()
      .insert(issueLabels)
      .values({ issueId: issue.id, labelId: fixture.labelBug });

    await bulk({ issueIds: [issue.id], addLabelIds: [fixture.labelFeature] });

    expect(await labelsOf(issue.id)).toEqual(
      [fixture.labelBug, fixture.labelFeature].sort(),
    );
  });

  it("removes only the named label", async () => {
    const issue = await createTestIssue(fixture.eng);
    await testDb()
      .insert(issueLabels)
      .values([
        { issueId: issue.id, labelId: fixture.labelBug },
        { issueId: issue.id, labelId: fixture.labelFeature },
      ]);

    await bulk({ issueIds: [issue.id], removeLabelIds: [fixture.labelBug] });

    expect(await labelsOf(issue.id)).toEqual([fixture.labelFeature]);
  });

  it("rejects a selection that matches no issue at all", async () => {
    await expect(bulk({ issueIds: ["missing-id"] })).rejects.toThrow(
      /no matching issues/i,
    );
  });
});

describe("partial success: valid issues keep their writes when a sibling fails", () => {
  it("reports updated and failed separately", async () => {
    const eng = await createTestIssue(fixture.eng);
    const prod = await createTestIssue(fixture.prod);

    const result = await bulk({
      issueIds: [eng.id, prod.id],
      statusId: fixture.eng.status.doing,
    });

    expect(result.updated).toEqual([eng.id]);
    expect(result.updatedCount).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].id).toBe(prod.id);
    expect(result.failed[0].identifier).toBe(`PROD-${prod.identifierNumber}`);
  });

  it("does not roll back the successful write", async () => {
    const eng = await createTestIssue(fixture.eng);
    const prod = await createTestIssue(fixture.prod);
    const prodStatusBefore = (await read(prod.id)).statusId;

    await bulk({
      issueIds: [eng.id, prod.id],
      statusId: fixture.eng.status.doing,
    });

    expect((await read(eng.id)).statusId).toBe(fixture.eng.status.doing);
    expect((await read(prod.id)).statusId).toBe(prodStatusBefore);
  });

  it("names the team mismatch on a cross-team cycle", async () => {
    const eng = await createTestIssue(fixture.eng);
    const prod = await createTestIssue(fixture.prod);

    const result = await bulk({
      issueIds: [eng.id, prod.id],
      cycleId: fixture.eng.currentCycleId,
    });

    expect(result.updated).toEqual([eng.id]);
    expect(result.failed[0].error).toMatch(/team/i);
  });

  it("fails only the issue whose project cannot hold the milestone", async () => {
    const inProject = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
    });
    const noProject = await createTestIssue(fixture.eng);

    const result = await bulk({
      issueIds: [inProject.id, noProject.id],
      milestoneId: fixture.milestoneA,
    });

    expect(result.updated).toEqual([inProject.id]);
    expect(result.failed).toHaveLength(1);
    expect((await read(inProject.id)).milestoneId).toBe(fixture.milestoneA);
  });
});

describe("per-team cycle targets", () => {
  it("resolves the current cycle of each issue's own team", async () => {
    const eng = await liveCycles(fixture.eng.id, [10, 11]);
    const prod = await liveCycles(fixture.prod.id, [20, 21]);
    const engIssue = await createTestIssue(fixture.eng);
    const prodIssue = await createTestIssue(fixture.prod);

    const result = await bulk({
      issueIds: [engIssue.id, prodIssue.id],
      cycleTarget: "current",
    });

    expect(result.failed).toEqual([]);
    expect((await read(engIssue.id)).cycleId).toBe(eng.active.id);
    expect((await read(prodIssue.id)).cycleId).toBe(prod.active.id);
  });

  it("resolves the soonest upcoming cycle for next", async () => {
    const eng = await liveCycles(fixture.eng.id, [10, 11]);
    const issue = await createTestIssue(fixture.eng);

    await bulk({ issueIds: [issue.id], cycleTarget: "next" });

    expect((await read(issue.id)).cycleId).toBe(eng.upcoming.id);
  });

  it("fails the issue whose team has no cycle running", async () => {
    await liveCycles(fixture.eng.id, [10, 11]);
    const engIssue = await createTestIssue(fixture.eng);
    const prodIssue = await createTestIssue(fixture.prod);

    const result = await bulk({
      issueIds: [engIssue.id, prodIssue.id],
      cycleTarget: "current",
    });

    expect(result.updated).toEqual([engIssue.id]);
    expect(result.failed[0].error).toMatch(/no cycle running/i);
  });
});

describe("bulk delete and restore", () => {
  it("soft deletes every issue in the selection", async () => {
    const one = await createTestIssue(fixture.eng);
    const two = await createTestIssue(fixture.eng);

    const result = await bulk({ issueIds: [one.id, two.id], deleted: true });

    expect(result.updatedCount).toBe(2);
    expect((await read(one.id)).deletedAt).toBeInstanceOf(Date);
    expect((await read(two.id)).deletedAt).toBeInstanceOf(Date);
  });

  it("restores through the same path, which is how undo works", async () => {
    const issue = await createTestIssue(fixture.eng);
    await bulk({ issueIds: [issue.id], deleted: true });

    await bulk({ issueIds: [issue.id], deleted: false });

    expect((await read(issue.id)).deletedAt).toBeNull();
  });

  it("rejects an ordinary edit of a deleted issue while leaving siblings alone", async () => {
    const deleted = await createTestIssue(fixture.eng);
    const live = await createTestIssue(fixture.eng);
    await bulk({ issueIds: [deleted.id], deleted: true });

    const result = await bulk({
      issueIds: [deleted.id, live.id],
      priority: "medium",
    });

    expect(result.updated).toEqual([live.id]);
    expect(result.failed[0].id).toBe(deleted.id);
  });

  it("archives and unarchives in bulk", async () => {
    const issue = await createTestIssue(fixture.eng);

    await bulk({ issueIds: [issue.id], archived: true });
    expect((await read(issue.id)).archivedAt).toBeInstanceOf(Date);

    await bulk({ issueIds: [issue.id], archived: false });
    expect((await read(issue.id)).archivedAt).toBeNull();
  });
});
