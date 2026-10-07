/**
 * The rules that protect issue data, exercised through the real `update-issue`
 * action against real SQL. These matter more than most tests in the suite:
 * every one of them is reachable by an agent over HTTP/MCP, not just by the UI.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import updateIssue from "../../../actions/update-issue";
import { activities, issues } from "../../../drizzle/schema";
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

const activityFor = async (id: string) =>
  testDb().select().from(activities).where(eq(activities.issueId, id));

// The action's arg type is built from a zod schema; tests call it positionally.
const update = (args: Record<string, unknown>) =>
  updateIssue.run(args as never);

// Nothing here changes teams, statuses, projects or cycles, so the fixture is
// seeded once and only issue-level rows are cleared between tests.
beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("status ownership", () => {
  it("accepts a status belonging to the issue's own team", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, statusId: fixture.eng.status.doing });

    expect((await read(issue.id)).statusId).toBe(fixture.eng.status.doing);
  });

  it("rejects a status owned by another team", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      update({ identifier: issue.id, statusId: fixture.prod.status.doing }),
    ).rejects.toThrow(/different team/i);
  });

  it("leaves the issue untouched when the status is rejected", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      update({
        identifier: issue.id,
        statusId: fixture.prod.status.doing,
        priority: "urgent",
      }),
    ).rejects.toThrow();

    const after = await read(issue.id);
    expect(after.statusId).toBe(issue.statusId);
    expect(after.priority).toBe(issue.priority);
    expect(after.version).toBe(issue.version);
    expect(await activityFor(issue.id)).toHaveLength(0);
  });

  it("rejects a status that does not exist", async () => {
    const issue = await createTestIssue(fixture.eng);
    await expect(
      update({ identifier: issue.id, statusId: "status-missing" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("cycle ownership", () => {
  it("accepts a cycle on the issue's own team", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, cycleId: fixture.eng.currentCycleId });

    expect((await read(issue.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("rejects another team's cycle", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      update({ identifier: issue.id, cycleId: fixture.prod.currentCycleId }),
    ).rejects.toThrow(/different team/i);
    expect((await read(issue.id)).cycleId).toBeNull();
  });

  it("rejects a cycle that does not exist", async () => {
    const issue = await createTestIssue(fixture.eng);
    await expect(
      update({ identifier: issue.id, cycleId: "cycle-missing" }),
    ).rejects.toThrow(/not found/i);
  });
});

describe("milestone ownership", () => {
  it("accepts a milestone from the issue's own project", async () => {
    const issue = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
    });

    await update({ identifier: issue.id, milestoneId: fixture.milestoneA });

    expect((await read(issue.id)).milestoneId).toBe(fixture.milestoneA);
  });

  it("rejects a milestone from a different project", async () => {
    const issue = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
    });

    await expect(
      update({ identifier: issue.id, milestoneId: fixture.milestoneB }),
    ).rejects.toThrow(/different project/i);
  });

  it("accepts a milestone that matches the project being set in the same write", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      projectId: fixture.projectB,
      milestoneId: fixture.milestoneB,
    });

    const after = await read(issue.id);
    expect(after.projectId).toBe(fixture.projectB);
    expect(after.milestoneId).toBe(fixture.milestoneB);
  });
});

describe("project and milestone move together", () => {
  it("clears the milestone when the issue moves to another project", async () => {
    const issue = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
    });

    await update({ identifier: issue.id, projectId: fixture.projectB });

    const after = await read(issue.id);
    expect(after.projectId).toBe(fixture.projectB);
    expect(after.milestoneId).toBeNull();
  });

  it("clears the milestone when the project is removed", async () => {
    const issue = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
    });

    await update({ identifier: issue.id, projectId: null });

    const after = await read(issue.id);
    expect(after.projectId).toBeNull();
    expect(after.milestoneId).toBeNull();
  });

  it("keeps the milestone when the project is unchanged", async () => {
    const issue = await createTestIssue(fixture.eng, {
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
    });

    await update({ identifier: issue.id, priority: "high" });

    expect((await read(issue.id)).milestoneId).toBe(fixture.milestoneA);
  });
});

describe("parent constraints", () => {
  it("accepts a parent on the same team", async () => {
    const parent = await createTestIssue(fixture.eng);
    const child = await createTestIssue(fixture.eng);

    await update({ identifier: child.id, parentIssueId: parent.id });

    expect((await read(child.id)).parentIssueId).toBe(parent.id);
  });

  it("rejects a parent on another team", async () => {
    const parent = await createTestIssue(fixture.prod);
    const child = await createTestIssue(fixture.eng);

    await expect(
      update({ identifier: child.id, parentIssueId: parent.id }),
    ).rejects.toThrow(/same team/i);
  });

  it("rejects an issue parenting itself", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      update({ identifier: issue.id, parentIssueId: issue.id }),
    ).rejects.toThrow(/its own parent/i);
  });

  it("rejects a cycle in the ancestry chain", async () => {
    const grandparent = await createTestIssue(fixture.eng);
    const parent = await createTestIssue(fixture.eng);
    const child = await createTestIssue(fixture.eng);

    await update({ identifier: parent.id, parentIssueId: grandparent.id });
    await update({ identifier: child.id, parentIssueId: parent.id });

    // Making the grandparent a child of its own descendant closes the loop.
    await expect(
      update({ identifier: grandparent.id, parentIssueId: child.id }),
    ).rejects.toThrow(/loop/i);
  });
});

describe("soft-deleted issues", () => {
  it("rejects an ordinary property update", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, deleted: true });

    await expect(
      update({ identifier: issue.id, priority: "urgent" }),
    ).rejects.toThrow(/deleted/i);
    expect((await read(issue.id)).priority).toBe("none");
  });

  it("allows the restore path", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, deleted: true });

    await update({ identifier: issue.id, deleted: false });

    expect((await read(issue.id)).deletedAt).toBeNull();
  });

  it("accepts ordinary updates again once restored", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, deleted: true });
    await update({ identifier: issue.id, deleted: false });

    await update({ identifier: issue.id, priority: "high" });

    expect((await read(issue.id)).priority).toBe("high");
  });

  it("cannot be chosen as a parent", async () => {
    const parent = await createTestIssue(fixture.eng);
    const child = await createTestIssue(fixture.eng);
    await update({ identifier: parent.id, deleted: true });

    await expect(
      update({ identifier: child.id, parentIssueId: parent.id }),
    ).rejects.toThrow(/not found/i);
    expect((await read(child.id)).parentIssueId).toBeNull();
  });

  it("is invisible to subscription writes", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, deleted: true });

    const subscribe = await import(
      "../../../actions/update-issue-subscription"
    );
    await expect(
      subscribe.default.run({
        identifier: issue.id,
        subscribed: true,
      } as never),
    ).rejects.toThrow(/not found/i);
  });
});

describe("completion and cancellation timestamps", () => {
  it("stamps completedAt when the issue reaches a completed status", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, statusId: fixture.eng.status.done });

    const after = await read(issue.id);
    expect(after.completedAt).toBeInstanceOf(Date);
    expect(after.canceledAt).toBeNull();
  });

  it("clears completedAt when the issue leaves a completed status", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, statusId: fixture.eng.status.done });

    await update({ identifier: issue.id, statusId: fixture.eng.status.todo });

    expect((await read(issue.id)).completedAt).toBeNull();
  });

  it("stamps canceledAt when the issue is canceled", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      statusId: fixture.eng.status.canceled,
    });

    const after = await read(issue.id);
    expect(after.canceledAt).toBeInstanceOf(Date);
    expect(after.completedAt).toBeNull();
  });

  it("clears canceledAt when work restarts", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({
      identifier: issue.id,
      statusId: fixture.eng.status.canceled,
    });

    await update({ identifier: issue.id, statusId: fixture.eng.status.doing });

    expect((await read(issue.id)).canceledAt).toBeNull();
  });

  it("keeps the original completion time across completed-to-completed moves", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, statusId: fixture.eng.status.done });
    const first = (await read(issue.id)).completedAt;

    // Same category, different write: the stamp records when work finished,
    // not when the row was last touched.
    await update({ identifier: issue.id, priority: "low" });

    expect((await read(issue.id)).completedAt).toEqual(first);
  });
});

describe("activity", () => {
  it("records a structured entry per changed field", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      statusId: fixture.eng.status.doing,
      priority: "high",
      assigneeId: fixture.humanB,
    });

    const entries = await activityFor(issue.id);
    expect(entries.map((entry) => entry.type).sort()).toEqual([
      "assignee_changed",
      "priority_changed",
      "status_changed",
    ]);
  });

  it("writes no activity for a no-op update", async () => {
    const issue = await createTestIssue(fixture.eng, { priority: "high" });

    await update({ identifier: issue.id, priority: "high" });

    expect(await activityFor(issue.id)).toHaveLength(0);
  });

  it("does not bump the version for a no-op update", async () => {
    const issue = await createTestIssue(fixture.eng, { priority: "high" });

    await update({ identifier: issue.id, priority: "high" });

    expect((await read(issue.id)).version).toBe(issue.version);
  });

  it("stores structured metadata rather than rendered prose", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, priority: "urgent" });

    const [entry] = await activityFor(issue.id);
    expect(entry.metadata).toMatchObject({
      field: "priority",
      from: "none",
      to: "urgent",
    });
    expect(JSON.stringify(entry.metadata)).not.toMatch(/changed|set to/i);
  });

  it("preserves the acting member", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, priority: "low" });

    const [entry] = await activityFor(issue.id);
    // Auth is disabled, so the first human member acts as the current user.
    expect(entry.actorId).toBe(fixture.humanA);
  });

  it("records archiving", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, archived: true });

    const entries = await activityFor(issue.id);
    expect(entries.map((entry) => entry.type)).toContain("archived_changed");
    expect((await read(issue.id)).archivedAt).toBeInstanceOf(Date);
  });
});
