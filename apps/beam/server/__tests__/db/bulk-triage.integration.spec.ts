/**
 * Bulk review. The interesting property is that batching changes nothing about
 * the decision itself: each issue still resolves its own team's statuses, still
 * writes activity, still notifies a new assignee. These tests exist to catch a
 * future "optimisation" that stops looping through the single-issue path.
 */
import { eq, inArray } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import bulkTriage from "../../../actions/bulk-update-issue-triage";
import listIssues from "../../../actions/list-issues";
import { issueQuery } from "../../../app/lib/issue-query";
import { activities, issues, notifications } from "../../../drizzle/schema";
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

const review = (args: Record<string, unknown>) => bulkTriage.run(args as never);

const read = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

const activityTypes = async (id: string) =>
  (await testDb().select().from(activities).where(eq(activities.issueId, id))).map(
    (row) => row.type,
  );

/** An issue sitting in the triage queue. */
const pending = (team: Fixture["eng"], overrides = {}) =>
  createTestIssue(team, {
    triageStatus: "pending",
    triageSource: "agent",
    ...overrides,
  });

const queue = async (scope: "pending" | "accepted" | "declined" | "snoozed") => {
  const result = await listIssues.run({
    query: issueQuery({
      filters: { teamId: [fixture.eng.id], triage: scope },
      grouping: "none",
    }),
  } as never);
  return result.groups.flatMap((group) => group.issues.map((issue) => issue.id));
};

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("bulk accept", () => {
  it("accepts every selected issue", async () => {
    const one = await pending(fixture.eng);
    const two = await pending(fixture.eng);

    const result = await review({
      issueIds: [one.id, two.id],
      action: "accept",
    });

    expect(result.reviewedCount).toBe(2);
    expect(result.failed).toEqual([]);
    expect((await read(one.id)).triageStatus).toBe("accepted");
    expect((await read(two.id)).triageStatus).toBe("accepted");
  });

  it("stamps who reviewed it and when", async () => {
    const issue = await pending(fixture.eng);

    await review({ issueIds: [issue.id], action: "accept" });

    const row = await read(issue.id);
    expect(row.triagedAt).toBeInstanceOf(Date);
    expect(row.triagedBy).toBe(fixture.humanA);
    expect(row.snoozedUntil).toBeNull();
  });

  it("resolves each issue's own team default status across a mixed selection", async () => {
    const eng = await pending(fixture.eng, {
      statusId: fixture.eng.status.canceled,
    });
    const prod = await createTestIssue(fixture.prod, {
      triageStatus: "pending",
      triageSource: "agent",
      statusId: fixture.prod.status.canceled,
    });

    const result = await review({
      issueIds: [eng.id, prod.id],
      action: "accept",
    });

    // No single status id could have satisfied both teams.
    expect(result.failed).toEqual([]);
    expect((await read(eng.id)).statusId).toBe(fixture.eng.status.todo);
    expect((await read(prod.id)).statusId).toBe(fixture.prod.status.todo);
  });

  it("keeps a status the issue already had, when it is still workable", async () => {
    const issue = await pending(fixture.eng, {
      statusId: fixture.eng.status.doing,
    });

    await review({ issueIds: [issue.id], action: "accept" });

    expect((await read(issue.id)).statusId).toBe(fixture.eng.status.doing);
  });

  it("applies a shared assignee and priority override", async () => {
    const one = await pending(fixture.eng);
    const two = await pending(fixture.eng);

    await review({
      issueIds: [one.id, two.id],
      action: "accept",
      assigneeId: fixture.humanB,
      priority: "high",
    });

    expect((await read(one.id)).assigneeId).toBe(fixture.humanB);
    expect((await read(two.id)).priority).toBe("high");
  });

  it("notifies the assignee exactly once per issue", async () => {
    const one = await pending(fixture.eng);
    const two = await pending(fixture.eng);

    await review({
      issueIds: [one.id, two.id],
      action: "accept",
      assigneeId: fixture.humanB,
    });

    const rows = await testDb()
      .select()
      .from(notifications)
      .where(eq(notifications.userId, fixture.humanB));
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.type === "issue_assigned")).toBe(true);
  });

  it("writes the same activity a single review would", async () => {
    const issue = await pending(fixture.eng);

    await review({
      issueIds: [issue.id],
      action: "accept",
      assigneeId: fixture.humanB,
    });

    const types = await activityTypes(issue.id);
    expect(types).toContain("triage_accepted");
    expect(types).toContain("assignee_changed");
  });

  it("rejects a cross-team status instead of applying it anywhere", async () => {
    const eng = await pending(fixture.eng);
    const prod = await createTestIssue(fixture.prod, {
      triageStatus: "pending",
      triageSource: "agent",
    });

    const result = await review({
      issueIds: [eng.id, prod.id],
      action: "accept",
      statusId: fixture.eng.status.doing,
    });

    expect(result.reviewed).toEqual([eng.id]);
    expect(result.failed[0].error).toMatch(/team/i);
    expect((await read(prod.id)).triageStatus).toBe("pending");
  });
});

describe("bulk decline", () => {
  it("moves every selected issue to its team's canceled status", async () => {
    const eng = await pending(fixture.eng);
    const prod = await createTestIssue(fixture.prod, {
      triageStatus: "pending",
      triageSource: "agent",
    });

    await review({ issueIds: [eng.id, prod.id], action: "decline" });

    expect((await read(eng.id)).statusId).toBe(fixture.eng.status.canceled);
    expect((await read(prod.id)).statusId).toBe(fixture.prod.status.canceled);
  });

  it("marks them declined without deleting anything", async () => {
    const issue = await pending(fixture.eng);

    await review({ issueIds: [issue.id], action: "decline" });

    const row = await read(issue.id);
    expect(row.triageStatus).toBe("declined");
    expect(row.deletedAt).toBeNull();
    expect(row.triagedBy).toBe(fixture.humanA);
  });

  it("keeps a shared reason on the activity row", async () => {
    const issue = await pending(fixture.eng);

    await review({
      issueIds: [issue.id],
      action: "decline",
      reason: "Duplicate of an existing report",
    });

    const [entry] = (
      await testDb().select().from(activities).where(eq(activities.issueId, issue.id))
    ).filter((row) => row.type === "triage_declined");
    expect((entry.metadata as Record<string, string>).reason).toMatch(
      /duplicate/i,
    );
  });

  it("does not require a reason", async () => {
    const issue = await pending(fixture.eng);

    await expect(
      review({ issueIds: [issue.id], action: "decline" }),
    ).resolves.toMatchObject({ reviewedCount: 1 });
  });
});

describe("bulk snooze", () => {
  it("applies one date to the whole selection", async () => {
    const one = await pending(fixture.eng);
    const two = await pending(fixture.eng);
    const until = new Date(NOW.getTime() + 7 * 86_400_000);

    await review({
      issueIds: [one.id, two.id],
      action: "snooze",
      snoozedUntil: until.toISOString(),
    });

    expect((await read(one.id)).triageStatus).toBe("snoozed");
    expect((await read(two.id)).snoozedUntil?.toISOString()).toBe(
      until.toISOString(),
    );
  });

  it("rejects a snooze with no date", async () => {
    const issue = await pending(fixture.eng);

    const result = await review({ issueIds: [issue.id], action: "snooze" });

    expect(result.reviewedCount).toBe(0);
    expect(result.failed[0].error).toMatch(/date/i);
  });
});

describe("partial success", () => {
  it("reviews the valid issues and reports the rest", async () => {
    const valid = await pending(fixture.eng);
    const notInTriage = await createTestIssue(fixture.eng);

    const result = await review({
      issueIds: [valid.id, notInTriage.id],
      action: "accept",
    });

    expect(result.reviewed).toEqual([valid.id]);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toMatch(/not in triage/i);
    expect(result.failed[0].identifier).toMatch(/^ENG-/);
  });

  it("does not roll back siblings that already succeeded", async () => {
    const valid = await pending(fixture.eng);
    const notInTriage = await createTestIssue(fixture.eng);

    await review({
      issueIds: [valid.id, notInTriage.id],
      action: "decline",
    });

    expect((await read(valid.id)).triageStatus).toBe("declined");
    expect((await read(notInTriage.id)).triageStatus).toBeNull();
  });

  it("rejects a selection that matches nothing", async () => {
    await expect(
      review({ issueIds: ["missing"], action: "accept" }),
    ).rejects.toThrow(/no matching issues/i);
  });
});

describe("the queue after a review", () => {
  it("removes accepted issues from Pending and lists them under Accepted", async () => {
    const issue = await pending(fixture.eng);

    await review({ issueIds: [issue.id], action: "accept" });

    expect(await queue("pending")).not.toContain(issue.id);
    expect(await queue("accepted")).toContain(issue.id);
  });

  it("removes declined issues from Pending and keeps them under Declined", async () => {
    const issue = await pending(fixture.eng);

    await review({ issueIds: [issue.id], action: "decline" });

    expect(await queue("pending")).not.toContain(issue.id);
    expect(await queue("declined")).toContain(issue.id);
  });

  it("moves snoozed issues out of Pending until the date passes", async () => {
    const issue = await pending(fixture.eng);
    const future = new Date(Date.now() + 7 * 86_400_000);

    await review({
      issueIds: [issue.id],
      action: "snooze",
      snoozedUntil: future.toISOString(),
    });

    expect(await queue("pending")).not.toContain(issue.id);
    expect(await queue("snoozed")).toContain(issue.id);
  });

  it("resurfaces a snooze whose date has already passed", async () => {
    const issue = await pending(fixture.eng);
    const past = new Date(Date.now() - 86_400_000);

    await review({
      issueIds: [issue.id],
      action: "snooze",
      snoozedUntil: past.toISOString(),
    });

    expect(await queue("pending")).toContain(issue.id);
  });

  it("returns accepted issues to the ordinary views", async () => {
    const issue = await pending(fixture.eng);

    await review({ issueIds: [issue.id], action: "accept" });

    const normal = await listIssues.run({
      query: issueQuery({ filters: { teamId: [fixture.eng.id] } }),
    } as never);
    const ids = normal.groups.flatMap((group) =>
      group.issues.map((entry) => entry.id),
    );
    expect(ids).toContain(issue.id);
  });

  it("leaves unreviewed issues in Pending", async () => {
    const reviewed = await pending(fixture.eng);
    const untouched = await pending(fixture.eng);

    await review({ issueIds: [reviewed.id], action: "accept" });

    const stillPending = await queue("pending");
    expect(stillPending).toContain(untouched.id);
    expect(stillPending).not.toContain(reviewed.id);
  });

  it("handles a batch spanning both teams without cross-contamination", async () => {
    const eng = await pending(fixture.eng);
    const prod = await createTestIssue(fixture.prod, {
      triageStatus: "pending",
      triageSource: "agent",
    });

    await review({ issueIds: [eng.id, prod.id], action: "accept" });

    const rows = await testDb()
      .select()
      .from(issues)
      .where(inArray(issues.id, [eng.id, prod.id]));
    expect(rows.every((row) => row.triageStatus === "accepted")).toBe(true);
    expect(rows.find((row) => row.id === eng.id)?.teamId).toBe(fixture.eng.id);
    expect(rows.find((row) => row.id === prod.id)?.teamId).toBe(fixture.prod.id);
  });
});
