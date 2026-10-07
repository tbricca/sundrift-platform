/**
 * `runIssueQuery` is the single read path behind every list, board, backlog and
 * saved view, so its SQL is worth exercising against real rows rather than a
 * hand-built predicate. Representative composition is tested here, not every
 * filter pair.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { issueQuery } from "../../../app/lib/issue-query";
import type { IssueQuery } from "../../../app/lib/issue-query";
import { issueLabels } from "../../../drizzle/schema";
import { runIssueQuery } from "../../issue-engine";
import {
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  createTestIssue,
  NOW,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const day = 86_400_000;
const at = (offset: number) => new Date(NOW.getTime() + offset * day);

async function run(patch: Partial<IssueQuery> = {}) {
  const result = await runIssueQuery(issueQuery(patch));
  return {
    ...result,
    ids: result.groups.flatMap((group) =>
      group.issues.map((issue) => issue.id),
    ),
    titles: result.groups.flatMap((group) =>
      group.issues.map((issue) => issue.title),
    ),
  };
}

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("filters", () => {
  it("scopes to a team", async () => {
    const eng = await createTestIssue(fixture.eng);
    await createTestIssue(fixture.prod);

    const result = await run({ filters: { teamId: [fixture.eng.id] } });

    expect(result.ids).toEqual([eng.id]);
    expect(result.total).toBe(1);
  });

  it("matches an exact status", async () => {
    const doing = await createTestIssue(fixture.eng, {
      statusId: fixture.eng.status.doing,
    });
    await createTestIssue(fixture.eng);

    const result = await run({
      filters: { statusId: [fixture.eng.status.doing] },
    });

    expect(result.ids).toEqual([doing.id]);
  });

  it("matches a status category across teams", async () => {
    const engDone = await createTestIssue(fixture.eng, {
      statusId: fixture.eng.status.done,
    });
    const prodDone = await createTestIssue(fixture.prod, {
      statusId: fixture.prod.status.done,
    });
    await createTestIssue(fixture.eng);

    const result = await run({ filters: { statusCategory: ["completed"] } });

    expect(result.ids.sort()).toEqual([engDone.id, prodDone.id].sort());
  });

  it("matches an assignee", async () => {
    const mine = await createTestIssue(fixture.eng, {
      assigneeId: fixture.humanA,
    });
    await createTestIssue(fixture.eng, { assigneeId: fixture.humanB });

    const result = await run({ filters: { assigneeId: [fixture.humanA] } });

    expect(result.ids).toEqual([mine.id]);
  });

  it("treats a null assignee as unassigned", async () => {
    const orphan = await createTestIssue(fixture.eng);
    await createTestIssue(fixture.eng, { assigneeId: fixture.humanA });

    const result = await run({ filters: { assigneeId: [null] } });

    expect(result.ids).toEqual([orphan.id]);
  });

  it("matches several priorities at once", async () => {
    const urgent = await createTestIssue(fixture.eng, { priority: "urgent" });
    const high = await createTestIssue(fixture.eng, { priority: "high" });
    await createTestIssue(fixture.eng, { priority: "low" });

    const result = await run({ filters: { priority: ["urgent", "high"] } });

    expect(result.ids.sort()).toEqual([urgent.id, high.id].sort());
  });

  it("includes issues carrying a label", async () => {
    const tagged = await createTestIssue(fixture.eng);
    await createTestIssue(fixture.eng);
    await testDb()
      .insert(issueLabels)
      .values({ issueId: tagged.id, labelId: fixture.labelBug });

    const result = await run({ filters: { labelId: [fixture.labelBug] } });

    expect(result.ids).toEqual([tagged.id]);
  });

  it("matches a project, a milestone and a cycle", async () => {
    const inProject = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
      cycleId: fixture.eng.currentCycleId,
    });
    await createTestIssue(fixture.eng);

    expect((await run({ filters: { projectId: [fixture.projectA] } })).ids).toEqual([
      inProject.id,
    ]);
    expect(
      (await run({ filters: { milestoneId: [fixture.milestoneA] } })).ids,
    ).toEqual([inProject.id]);
    expect(
      (await run({ filters: { cycleId: [fixture.eng.currentCycleId] } })).ids,
    ).toEqual([inProject.id]);
  });

  it("matches the creator", async () => {
    const byAgent = await createTestIssue(fixture.eng, {
      createdBy: fixture.agentA,
    });
    await createTestIssue(fixture.eng);

    const result = await run({ filters: { creatorId: [fixture.agentA] } });

    expect(result.ids).toEqual([byAgent.id]);
    expect(result.groups.flatMap((g) => g.issues)[0].creator?.kind).toBe("agent");
  });

  it("filters by due date range and by having a due date at all", async () => {
    const soon = await createTestIssue(fixture.eng, { dueDate: at(2) });
    const later = await createTestIssue(fixture.eng, { dueDate: at(20) });
    await createTestIssue(fixture.eng);

    expect(
      (await run({ filters: { dueBefore: at(5).toISOString() } })).ids,
    ).toEqual([soon.id]);
    expect(
      (await run({ filters: { dueAfter: at(10).toISOString() } })).ids,
    ).toEqual([later.id]);
    expect((await run({ filters: { dueSet: true } })).ids.sort()).toEqual(
      [soon.id, later.id].sort(),
    );
    expect((await run({ filters: { dueSet: false } })).ids).toHaveLength(1);
  });

  it("filters by created and updated ranges", async () => {
    const old = await createTestIssue(fixture.eng, {
      createdAt: at(-40),
      updatedAt: at(-40),
    });
    const fresh = await createTestIssue(fixture.eng, {
      createdAt: at(-1),
      updatedAt: at(-1),
    });

    expect(
      (await run({ filters: { createdBefore: at(-10).toISOString() } })).ids,
    ).toEqual([old.id]);
    expect(
      (await run({ filters: { updatedAfter: at(-5).toISOString() } })).ids,
    ).toEqual([fresh.id]);
  });

  it("searches titles", async () => {
    const match = await createTestIssue(fixture.eng, {
      title: "Checkout latency spike",
    });
    await createTestIssue(fixture.eng, { title: "Update onboarding copy" });

    const result = await run({ filters: { search: "latency" } });

    expect(result.ids).toEqual([match.id]);
  });

  it("composes filters as AND", async () => {
    const both = await createTestIssue(fixture.eng, {
      assigneeId: fixture.humanA,
      priority: "urgent",
    });
    await createTestIssue(fixture.eng, { assigneeId: fixture.humanA });
    await createTestIssue(fixture.eng, { priority: "urgent" });

    const result = await run({
      filters: { assigneeId: [fixture.humanA], priority: ["urgent"] },
    });

    expect(result.ids).toEqual([both.id]);
  });
});

describe("exclusions", () => {
  it("negates a matching filter", async () => {
    const keep = await createTestIssue(fixture.eng);
    await createTestIssue(fixture.eng, { priority: "urgent" });

    const result = await run({ filters: { exclude: { priority: ["urgent"] } } });

    expect(result.ids).toEqual([keep.id]);
  });

  it("excludes a label without excluding untagged issues", async () => {
    const tagged = await createTestIssue(fixture.eng);
    const untagged = await createTestIssue(fixture.eng);
    await testDb()
      .insert(issueLabels)
      .values({ issueId: tagged.id, labelId: fixture.labelBug });

    const result = await run({ filters: { exclude: { labelId: [fixture.labelBug] } } });

    expect(result.ids).toEqual([untagged.id]);
  });

  it("excludes a whole team", async () => {
    await createTestIssue(fixture.eng);
    const prod = await createTestIssue(fixture.prod);

    const result = await run({ filters: { exclude: { teamId: [fixture.eng.id] } } });

    expect(result.ids).toEqual([prod.id]);
  });
});

describe("archived, deleted and triage visibility", () => {
  it("hides archived issues by default and includes them on request", async () => {
    const live = await createTestIssue(fixture.eng);
    const archived = await createTestIssue(fixture.eng, { archivedAt: at(-1) });

    expect((await run()).ids).toEqual([live.id]);
    expect((await run({ filters: { includeArchived: true } })).ids.sort()).toEqual(
      [live.id, archived.id].sort(),
    );
  });

  it("hides soft-deleted issues even when archived are included", async () => {
    const live = await createTestIssue(fixture.eng);
    await createTestIssue(fixture.eng, { deletedAt: at(-1) });

    expect((await run({ filters: { includeArchived: true } })).ids).toEqual([
      live.id,
    ]);
  });

  it("returns soft-deleted issues only on the internal includeDeleted path", async () => {
    const deleted = await createTestIssue(fixture.eng, { deletedAt: at(-1) });

    const result = await run({ filters: { includeDeleted: true } });

    expect(result.ids).toContain(deleted.id);
  });

  it("hides unreviewed triage by default and returns it under an explicit scope", async () => {
    const normal = await createTestIssue(fixture.eng);
    const pending = await createTestIssue(fixture.eng, {
      triageStatus: "pending",
      triageSource: "agent",
    });

    expect((await run()).ids).toEqual([normal.id]);
    expect((await run({ filters: { triage: "pending" } })).ids).toEqual([
      pending.id,
    ]);
    expect((await run({ filters: { triage: "any" } })).ids.sort()).toEqual(
      [normal.id, pending.id].sort(),
    );
  });
});

describe("ordering", () => {
  it("orders by priority, urgent first", async () => {
    await createTestIssue(fixture.eng, { title: "low", priority: "low" });
    await createTestIssue(fixture.eng, { title: "urgent", priority: "urgent" });
    await createTestIssue(fixture.eng, { title: "medium", priority: "medium" });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "priority", direction: "desc" }],
    });

    expect(result.titles).toEqual(["urgent", "medium", "low"]);
  });

  it("orders by createdAt", async () => {
    await createTestIssue(fixture.eng, { title: "old", createdAt: at(-10) });
    await createTestIssue(fixture.eng, { title: "new", createdAt: at(-1) });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "createdAt", direction: "desc" }],
    });

    expect(result.titles).toEqual(["new", "old"]);
  });

  it("orders by updatedAt", async () => {
    await createTestIssue(fixture.eng, { title: "stale", updatedAt: at(-10) });
    await createTestIssue(fixture.eng, { title: "touched", updatedAt: at(-1) });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "updatedAt", direction: "desc" }],
    });

    expect(result.titles).toEqual(["touched", "stale"]);
  });

  it("orders by due date", async () => {
    await createTestIssue(fixture.eng, { title: "later", dueDate: at(20) });
    await createTestIssue(fixture.eng, { title: "sooner", dueDate: at(2) });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "dueDate", direction: "asc" }],
    });

    expect(result.titles.slice(0, 2)).toEqual(["sooner", "later"]);
  });

  it("orders by title", async () => {
    await createTestIssue(fixture.eng, { title: "Zebra" });
    await createTestIssue(fixture.eng, { title: "Apple" });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "title", direction: "asc" }],
    });

    expect(result.titles).toEqual(["Apple", "Zebra"]);
  });

  it("orders manually by sortOrder", async () => {
    await createTestIssue(fixture.eng, { title: "second", sortOrder: 200 });
    await createTestIssue(fixture.eng, { title: "first", sortOrder: 100 });

    const result = await run({
      grouping: "none",
      ordering: [{ field: "manual", direction: "asc" }],
    });

    expect(result.titles).toEqual(["first", "second"]);
  });
});

describe("grouping", () => {
  it("groups by status and keeps every team status as a column on a board", async () => {
    await createTestIssue(fixture.eng, { statusId: fixture.eng.status.doing });

    const result = await run({
      filters: { teamId: [fixture.eng.id] },
      grouping: "status",
      layout: "board",
    });

    expect(result.groups).toHaveLength(5);
    const doing = result.groups.find((g) => g.key === fixture.eng.status.doing)!;
    expect(doing.count).toBe(1);
    expect(result.groups.filter((g) => g.count === 0)).toHaveLength(4);
  });

  it("prunes empty groups in a list", async () => {
    await createTestIssue(fixture.eng, { statusId: fixture.eng.status.doing });

    const result = await run({
      filters: { teamId: [fixture.eng.id] },
      grouping: "status",
      layout: "list",
    });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].key).toBe(fixture.eng.status.doing);
  });

  it("groups by assignee with an unassigned bucket", async () => {
    await createTestIssue(fixture.eng, { assigneeId: fixture.humanA });
    await createTestIssue(fixture.eng);

    const result = await run({ grouping: "assignee" });
    const keys = result.groups.filter((g) => g.count > 0).map((g) => g.key);

    expect(keys).toContain(fixture.humanA);
    expect(keys).toContain("unassigned");
  });

  it("groups by priority", async () => {
    await createTestIssue(fixture.eng, { priority: "urgent" });

    const result = await run({ grouping: "priority", layout: "board" });
    const urgent = result.groups.find((g) => g.key === "urgent")!;

    expect(urgent.count).toBe(1);
  });

  it("groups by project with a no-project bucket", async () => {
    await createTestIssue(fixture.eng, { projectId: fixture.projectA });
    await createTestIssue(fixture.eng);

    const result = await run({ grouping: "project" });
    const keys = result.groups.filter((g) => g.count > 0).map((g) => g.key);

    expect(keys).toContain(fixture.projectA);
    expect(keys).toContain("no-project");
  });

  it("groups by cycle with a no-cycle bucket", async () => {
    await createTestIssue(fixture.eng, { cycleId: fixture.eng.currentCycleId });
    await createTestIssue(fixture.eng);

    const result = await run({ grouping: "cycle" });
    const keys = result.groups.filter((g) => g.count > 0).map((g) => g.key);

    expect(keys).toContain(fixture.eng.currentCycleId);
    expect(keys).toContain("no-cycle");
  });

  it("lists a multi-label issue under each of its labels", async () => {
    const issue = await createTestIssue(fixture.eng);
    await testDb()
      .insert(issueLabels)
      .values([
        { issueId: issue.id, labelId: fixture.labelBug },
        { issueId: issue.id, labelId: fixture.labelFeature },
      ]);
    await createTestIssue(fixture.eng);

    const result = await run({ grouping: "label" });
    const keys = result.groups.filter((g) => g.count > 0).map((g) => g.key);

    expect(keys).toContain(fixture.labelBug);
    expect(keys).toContain(fixture.labelFeature);
    expect(keys).toContain("no-label");
    // total counts issues, not group memberships.
    expect(result.total).toBe(2);
  });

  it("returns one bucket when grouping is off", async () => {
    await createTestIssue(fixture.eng);
    await createTestIssue(fixture.prod);

    const result = await run({ grouping: "none" });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].key).toBe("all");
    expect(result.groups[0].count).toBe(2);
  });
});

describe("row shape", () => {
  it("carries the joined references a list row renders from", async () => {
    const issue = await createTestIssue(fixture.eng, {
      assigneeId: fixture.humanB,
      projectId: fixture.projectA,
      cycleId: fixture.eng.currentCycleId,
    });
    await testDb()
      .insert(issueLabels)
      .values({ issueId: issue.id, labelId: fixture.labelBug });

    const [row] = (await run()).groups.flatMap((group) => group.issues);

    expect(row.identifier).toBe(`ENG-${issue.identifierNumber}`);
    expect(row.team.key).toBe("ENG");
    expect(row.status.category).toBe("unstarted");
    expect(row.assignee?.name).toBe("Ben Human");
    expect(row.project?.name).toBe("Project A");
    expect(row.cycle?.number).toBe(1);
    expect(row.labels.map((label) => label.name)).toEqual(["Bug"]);
  });
});
