/**
 * Triage review, end to end. The interesting part is not the state column but
 * the fact that triage is a *filter* on the one issue engine: an unreviewed
 * issue has to be invisible everywhere else without any preset opting out, and
 * a snooze has to resurface by time rather than by a background job.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import updateTriage from "../../../actions/update-issue-triage";
import { activities, issues } from "../../../drizzle/schema";
import { runIssueQuery } from "../../issue-engine";
import {
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  NOW,
  createTestIssue,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const read = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

const triage = (args: Record<string, unknown>) =>
  updateTriage.run(args as never);

const query = async (filters: Record<string, unknown> = {}) => {
  const result = await runIssueQuery({
    filters,
    grouping: "none",
    ordering: [{ field: "manual", direction: "asc" }],
    layout: "list",
    visibleColumns: [],
  } as never);
  return result.groups.flatMap((group) => group.issues);
};

const pendingIssue = () =>
  createTestIssue(fixture.eng, {
    triageStatus: "pending",
    triageSource: "api",
  });

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("accept", () => {
  it("marks the issue accepted and stamps who reviewed it", async () => {
    const issue = await pendingIssue();

    await triage({ identifier: issue.id, action: "accept" });

    const after = await read(issue.id);
    expect(after.triageStatus).toBe("accepted");
    expect(after.triagedAt).toBeInstanceOf(Date);
    expect(after.triagedBy).toBe(fixture.humanA);
  });

  it("moves the issue into a workable status", async () => {
    const issue = await createTestIssue(fixture.eng, {
      triageStatus: "pending",
      statusId: fixture.eng.status.canceled,
    });

    await triage({ identifier: issue.id, action: "accept" });

    // A canceled intake status is replaced; anything else is respected.
    expect((await read(issue.id)).statusId).toBe(fixture.eng.status.todo);
  });

  it("keeps a status the intake already chose", async () => {
    const issue = await createTestIssue(fixture.eng, {
      triageStatus: "pending",
      statusId: fixture.eng.status.doing,
    });

    await triage({ identifier: issue.id, action: "accept" });

    expect((await read(issue.id)).statusId).toBe(fixture.eng.status.doing);
  });

  it("applies assignee, priority, project and cycle in the same call", async () => {
    const issue = await pendingIssue();

    await triage({
      identifier: issue.id,
      action: "accept",
      assigneeId: fixture.humanB,
      priority: "high",
      projectId: fixture.projectA,
      cycleId: fixture.eng.currentCycleId,
    });

    const after = await read(issue.id);
    expect(after.assigneeId).toBe(fixture.humanB);
    expect(after.priority).toBe("high");
    expect(after.projectId).toBe(fixture.projectA);
    expect(after.cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("runs optional fields through the normal validation", async () => {
    const issue = await pendingIssue();

    // Accepting is not a bypass: another team's cycle is still rejected.
    await expect(
      triage({
        identifier: issue.id,
        action: "accept",
        cycleId: fixture.prod.currentCycleId,
      }),
    ).rejects.toThrow(/different team/i);
  });

  it("records a structured triage activity", async () => {
    const issue = await pendingIssue();

    await triage({ identifier: issue.id, action: "accept" });

    const entries = await testDb()
      .select()
      .from(activities)
      .where(eq(activities.issueId, issue.id));
    const accepted = entries.find((entry) => entry.type === "triage_accepted");
    expect(accepted?.metadata).toMatchObject({ field: "triage", to: "accepted" });
    expect(accepted?.actorId).toBe(fixture.humanA);
  });
});

describe("decline", () => {
  it("cancels the issue without deleting it", async () => {
    const issue = await pendingIssue();

    await triage({ identifier: issue.id, action: "decline" });

    const after = await read(issue.id);
    expect(after.triageStatus).toBe("declined");
    expect(after.statusId).toBe(fixture.eng.status.canceled);
    expect(after.deletedAt).toBeNull();
    expect(after.canceledAt).toBeInstanceOf(Date);
  });

  it("keeps the reason on the activity row", async () => {
    const issue = await pendingIssue();

    await triage({
      identifier: issue.id,
      action: "decline",
      reason: "Duplicate of an existing report",
    });

    const entries = await testDb()
      .select()
      .from(activities)
      .where(eq(activities.issueId, issue.id));
    const declined = entries.find((entry) => entry.type === "triage_declined");
    expect(declined?.metadata).toMatchObject({
      reason: "Duplicate of an existing report",
    });
  });
});

describe("snooze", () => {
  it("stores the wake-up date", async () => {
    const issue = await pendingIssue();
    const until = new Date(NOW.getTime() + 7 * 86_400_000);

    await triage({
      identifier: issue.id,
      action: "snooze",
      snoozedUntil: until.toISOString(),
    });

    const after = await read(issue.id);
    expect(after.triageStatus).toBe("snoozed");
    expect(after.snoozedUntil?.toISOString()).toBe(until.toISOString());
  });

  it("requires a date", async () => {
    const issue = await pendingIssue();
    await expect(
      triage({ identifier: issue.id, action: "snooze" }),
    ).rejects.toThrow(/needs a date/i);
  });

  it("rejects an unparseable date", async () => {
    const issue = await pendingIssue();
    await expect(
      triage({
        identifier: issue.id,
        action: "snooze",
        snoozedUntil: "not a date",
      }),
    ).rejects.toThrow(/not a valid date/i);
  });

  it("clears the snooze when the issue is later accepted", async () => {
    const issue = await pendingIssue();
    await triage({
      identifier: issue.id,
      action: "snooze",
      snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });

    await triage({ identifier: issue.id, action: "accept" });

    expect((await read(issue.id)).snoozedUntil).toBeNull();
  });
});

describe("triage visibility through the issue engine", () => {
  it("hides unreviewed intake from ordinary views", async () => {
    const pending = await pendingIssue();
    const normal = await createTestIssue(fixture.eng);

    const ids = (await query({ teamId: [fixture.eng.id] })).map((i) => i.id);
    expect(ids).toContain(normal.id);
    expect(ids).not.toContain(pending.id);
  });

  it("returns intake under an explicit pending scope", async () => {
    const pending = await pendingIssue();

    const ids = (
      await query({ teamId: [fixture.eng.id], triage: "pending" })
    ).map((i) => i.id);
    expect(ids).toContain(pending.id);
  });

  it("returns an accepted issue to ordinary views", async () => {
    const issue = await pendingIssue();
    await triage({ identifier: issue.id, action: "accept" });

    const ids = (await query({ teamId: [fixture.eng.id] })).map((i) => i.id);
    expect(ids).toContain(issue.id);
  });

  it("keeps a declined issue visible to ordinary views", async () => {
    const issue = await pendingIssue();
    await triage({ identifier: issue.id, action: "decline" });

    // Declining cancels rather than hides: the row stays part of history.
    const ids = (await query({ teamId: [fixture.eng.id] })).map((i) => i.id);
    expect(ids).toContain(issue.id);
  });

  it("treats a future snooze as snoozed, not pending", async () => {
    const issue = await pendingIssue();
    await triage({
      identifier: issue.id,
      action: "snooze",
      snoozedUntil: new Date(Date.now() + 86_400_000).toISOString(),
    });

    const pending = (await query({ triage: "pending" })).map((i) => i.id);
    const snoozed = (await query({ triage: "snoozed" })).map((i) => i.id);
    expect(pending).not.toContain(issue.id);
    expect(snoozed).toContain(issue.id);
  });

  it("resurfaces an expired snooze as pending without a background job", async () => {
    // Written straight to the row: the point is that the query, not a cron,
    // decides when a snooze is over.
    const issue = await createTestIssue(fixture.eng, {
      triageStatus: "snoozed",
      snoozedUntil: new Date(Date.now() - 86_400_000),
    });

    const pending = (await query({ triage: "pending" })).map((i) => i.id);
    const snoozed = (await query({ triage: "snoozed" })).map((i) => i.id);
    expect(pending).toContain(issue.id);
    expect(snoozed).not.toContain(issue.id);
  });

  it("still hides an expired snooze from ordinary views", async () => {
    const issue = await createTestIssue(fixture.eng, {
      triageStatus: "snoozed",
      snoozedUntil: new Date(Date.now() - 86_400_000),
    });

    const ids = (await query({ teamId: [fixture.eng.id] })).map((i) => i.id);
    expect(ids).not.toContain(issue.id);
  });

  it("returns everything under the 'any' scope", async () => {
    const pending = await pendingIssue();
    const normal = await createTestIssue(fixture.eng);

    const ids = (await query({ teamId: [fixture.eng.id], triage: "any" })).map(
      (i) => i.id,
    );
    expect(ids).toEqual(expect.arrayContaining([pending.id, normal.id]));
  });
});

describe("guards", () => {
  it("refuses to review an issue that never entered triage", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      triage({ identifier: issue.id, action: "accept" }),
    ).rejects.toThrow(/not in triage/i);
  });
});
