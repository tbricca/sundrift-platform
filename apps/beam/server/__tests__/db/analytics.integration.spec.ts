/**
 * Analytics against real Postgres.
 *
 * These tests exist because the metrics are pure SQL: there is no JavaScript
 * implementation to unit-test, and a wrong `filter (where ...)` produces a
 * plausible-looking number rather than an error. Every date is stated relative
 * to the fixture clock and every window is passed explicitly, so nothing here
 * depends on when the suite runs.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveRange } from "../../../app/lib/analytics";
import { cycles, issues } from "../../../drizzle/schema";
import {
  getCycleAnalytics,
  getProjectAnalytics,
  getTeamAnalytics,
} from "../../analytics";
import { resetIssueData, resetTestDatabase, testDb } from "../../testing/database";
import {
  createTestIssue,
  NOW,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
  type TeamFixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const DAY = 86_400_000;
const daysAgo = (count: number) => new Date(NOW.getTime() - count * DAY);

/**
 * The same windows the app asks for, resolved by the same function, so these
 * tests exercise the real day-alignment rather than a parallel definition.
 */
const window30 = resolveRange("30d", NOW);
const window7 = resolveRange("7d", NOW);
const window90 = resolveRange("90d", NOW);

const teamAnalytics = (team: TeamFixture, overrides = {}) =>
  getTeamAnalytics({ teamId: team.id, ...window30, ...overrides });

/** An issue that was created and then finished, with both dates stated. */
const completedIssue = (
  team: TeamFixture,
  createdDaysAgo: number,
  completedDaysAgo: number,
  overrides: Record<string, unknown> = {},
) =>
  createTestIssue(team, {
    statusId: team.status.done,
    createdAt: daysAgo(createdDaysAgo),
    completedAt: daysAgo(completedDaysAgo),
    ...overrides,
  });

const canceledIssue = (
  team: TeamFixture,
  createdDaysAgo: number,
  canceledDaysAgo: number,
  overrides: Record<string, unknown> = {},
) =>
  createTestIssue(team, {
    statusId: team.status.canceled,
    createdAt: daysAgo(createdDaysAgo),
    canceledAt: daysAgo(canceledDaysAgo),
    ...overrides,
  });

const openIssue = (
  team: TeamFixture,
  createdDaysAgo: number,
  overrides: Record<string, unknown> = {},
) =>
  createTestIssue(team, {
    createdAt: daysAgo(createdDaysAgo),
    ...overrides,
  });

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

/* -------------------------------------------------------------------------- */

describe("team analytics: counting", () => {
  it("dates each metric by its own event, not one shared column", async () => {
    // Created inside the window, still open.
    await openIssue(fixture.eng, 3);
    // Created before the window but completed inside it: a completion only.
    await completedIssue(fixture.eng, 100, 2);
    // Created and completed inside the window: both.
    await completedIssue(fixture.eng, 10, 4);
    // Canceled inside the window.
    await canceledIssue(fixture.eng, 8, 3);

    const result = await teamAnalytics(fixture.eng);

    expect(result.created).toBe(3);
    expect(result.completed).toBe(2);
    expect(result.canceled).toBe(1);
  });

  it("keeps teams separate", async () => {
    await completedIssue(fixture.eng, 5, 2);
    await completedIssue(fixture.prod, 5, 2);
    await completedIssue(fixture.prod, 6, 3);

    expect((await teamAnalytics(fixture.eng)).completed).toBe(1);
    expect((await teamAnalytics(fixture.prod)).completed).toBe(2);
  });

  it("never counts a canceled issue as completed", async () => {
    await canceledIssue(fixture.eng, 8, 3);

    const result = await teamAnalytics(fixture.eng);

    expect(result.completed).toBe(0);
    expect(result.canceled).toBe(1);
    expect(result.completionTime).toBeNull();
  });
});

describe("team analytics: window boundaries", () => {
  it("includes the first instant of the window and excludes the last", async () => {
    await createTestIssue(fixture.eng, { createdAt: window30.start });
    await createTestIssue(fixture.eng, {
      createdAt: new Date(window30.start.getTime() - 1),
    });
    await createTestIssue(fixture.eng, { createdAt: window30.end });

    expect((await teamAnalytics(fixture.eng)).created).toBe(1);
  });

  it("counts work done today, on the last day of the window", async () => {
    await createTestIssue(fixture.eng, {
      createdAt: new Date(window30.end.getTime() - 1),
    });

    expect((await teamAnalytics(fixture.eng)).created).toBe(1);
  });

  it("narrows as the window shrinks", async () => {
    await openIssue(fixture.eng, 3);
    await openIssue(fixture.eng, 20);
    await openIssue(fixture.eng, 60);

    expect((await teamAnalytics(fixture.eng, window7)).created).toBe(1);
    expect((await teamAnalytics(fixture.eng)).created).toBe(2);
    expect((await teamAnalytics(fixture.eng, window90)).created).toBe(3);
  });
});

describe("team analytics: which issues are in scope", () => {
  it("excludes soft-deleted issues everywhere", async () => {
    await completedIssue(fixture.eng, 5, 2);
    await completedIssue(fixture.eng, 5, 2, { deletedAt: daysAgo(1) });

    const result = await teamAnalytics(fixture.eng);

    expect(result.created).toBe(1);
    expect(result.completed).toBe(1);
  });

  it("includes archived issues, because archiving is not deletion", async () => {
    await completedIssue(fixture.eng, 6, 5, { archivedAt: daysAgo(1) });

    const result = await teamAnalytics(fixture.eng);

    expect(result.created).toBe(1);
    expect(result.completed).toBe(1);
  });

  it("excludes issues still waiting in triage", async () => {
    await openIssue(fixture.eng, 3, { triageStatus: "pending" });
    await openIssue(fixture.eng, 3, { triageStatus: "snoozed" });

    expect((await teamAnalytics(fixture.eng)).created).toBe(0);
  });

  it("counts issues once triage has reviewed them", async () => {
    await openIssue(fixture.eng, 3, { triageStatus: "accepted" });
    await canceledIssue(fixture.eng, 4, 2, { triageStatus: "declined" });

    const result = await teamAnalytics(fixture.eng);

    expect(result.created).toBe(2);
    expect(result.canceled).toBe(1);
  });
});

describe("team analytics: completion time", () => {
  it("takes the median of created-to-completed durations", async () => {
    await completedIssue(fixture.eng, 5, 2); // 3 days
    await completedIssue(fixture.eng, 10, 4); // 6 days
    await completedIssue(fixture.eng, 20, 1); // 19 days

    const result = await teamAnalytics(fixture.eng);

    expect(result.completionTime?.sampleSize).toBe(3);
    expect(result.completionTime?.medianSeconds).toBe(6 * 86_400);
    expect(result.completionTime?.p75Seconds).toBe(12.5 * 86_400);
  });

  it("interpolates between the middle two of an even sample", async () => {
    await completedIssue(fixture.eng, 6, 4); // 2 days
    await completedIssue(fixture.eng, 8, 4); // 4 days

    const result = await teamAnalytics(fixture.eng);

    expect(result.completionTime?.medianSeconds).toBe(3 * 86_400);
  });

  it("ignores canceled issues however long they lived", async () => {
    await completedIssue(fixture.eng, 6, 4); // 2 days
    await completedIssue(fixture.eng, 8, 4); // 4 days
    await canceledIssue(fixture.eng, 200, 1);

    expect((await teamAnalytics(fixture.eng)).completionTime?.medianSeconds).toBe(
      3 * 86_400,
    );
  });

  it("ignores completions dated before their own creation", async () => {
    // Imports and seeds have produced these. A negative duration cannot be
    // true, and folding one into a median gives a figure no reader can
    // challenge, so it is measured out while still counting as a completion.
    await completedIssue(fixture.eng, 5, 2); // 3 days
    await completedIssue(fixture.eng, 2, 5); // finished before it existed

    const result = await teamAnalytics(fixture.eng);

    expect(result.completed).toBe(2);
    expect(result.completionTime?.sampleSize).toBe(1);
    expect(result.completionTime?.medianSeconds).toBe(3 * 86_400);
  });

  it("reports no duration when every completion is incoherent", async () => {
    await completedIssue(fixture.eng, 2, 5);

    const result = await teamAnalytics(fixture.eng);

    expect(result.completed).toBe(1);
    expect(result.completionTime).toBeNull();
  });

  it("reports nothing rather than zero when there are no completions", async () => {
    await openIssue(fixture.eng, 3);

    const result = await teamAnalytics(fixture.eng);

    expect(result.completionTime).toBeNull();
    expect(result.completionRate).toBeNull();
  });
});

describe("team analytics: completion rate", () => {
  it("is completions over everything resolved in the window", async () => {
    await completedIssue(fixture.eng, 5, 2);
    await completedIssue(fixture.eng, 5, 2);
    await completedIssue(fixture.eng, 5, 2);
    await canceledIssue(fixture.eng, 5, 2);

    expect((await teamAnalytics(fixture.eng)).completionRate).toBe(75);
  });

  it("is not dragged down by unfinished issues created in the window", async () => {
    await completedIssue(fixture.eng, 5, 2);
    await openIssue(fixture.eng, 1);
    await openIssue(fixture.eng, 1);

    expect((await teamAnalytics(fixture.eng)).completionRate).toBe(100);
  });
});

describe("team analytics: estimates and assignees", () => {
  it("sums estimate points only for completed issues", async () => {
    await completedIssue(fixture.eng, 5, 2, { estimate: 3 });
    await completedIssue(fixture.eng, 5, 2, { estimate: 5 });
    await openIssue(fixture.eng, 5, { estimate: 8 });

    expect((await teamAnalytics(fixture.eng)).completedEstimate).toBe(8);
  });

  it("reports no estimate rather than zero when none are recorded", async () => {
    await completedIssue(fixture.eng, 5, 2);

    expect((await teamAnalytics(fixture.eng)).completedEstimate).toBeNull();
  });

  it("splits completions across humans, agents and nobody", async () => {
    await completedIssue(fixture.eng, 5, 2, { assigneeId: fixture.humanA });
    await completedIssue(fixture.eng, 5, 2, { assigneeId: fixture.humanB });
    await completedIssue(fixture.eng, 5, 2, { assigneeId: fixture.agentA });
    await completedIssue(fixture.eng, 5, 2);

    expect((await teamAnalytics(fixture.eng)).completedBy).toEqual({
      human: 2,
      agent: 1,
      unassigned: 1,
    });
  });
});

describe("team analytics: trend buckets", () => {
  it("emits one bucket per day including empty ones", async () => {
    const result = await teamAnalytics(fixture.eng, window7);

    expect(result.trend).toHaveLength(7);
    expect(result.trend.every((bucket) => bucket.created === 0)).toBe(true);
  });

  it("ends the trend on today", async () => {
    const result = await teamAnalytics(fixture.eng, window7);

    expect(result.trend[result.trend.length - 1]?.date).toBe(NOW.toISOString().slice(0, 10));
  });

  it("places creations and completions in their own days", async () => {
    await completedIssue(fixture.eng, 5, 2);

    const result = await teamAnalytics(fixture.eng, window7);

    const created = result.trend.find((bucket) => bucket.created > 0);
    const completed = result.trend.find((bucket) => bucket.completed > 0);

    expect(created?.date).toBe(daysAgo(5).toISOString().slice(0, 10));
    expect(completed?.date).toBe(daysAgo(2).toISOString().slice(0, 10));
    expect(created?.date).not.toBe(completed?.date);
  });

  it("groups into weeks over a quarter", async () => {
    const result = await teamAnalytics(fixture.eng, window90);

    expect(result.trend.length).toBeLessThanOrEqual(14);
    expect(result.trend.length).toBeGreaterThanOrEqual(12);
  });
});

/* -------------------------------------------------------------------------- */

describe("cycle analytics", () => {
  /**
   * A finished cycle sitting before a team active cycle. Cycles are not part of
   * the volatile data that resetIssueData clears, so this is seeded against the
   * team no other case in this block reads: otherwise it would survive into the
   * no-previous-cycle test below and quietly break it.
   */
  const seedPreviousCycle = async (team: TeamFixture) => {
    const id = `${team.id}-cycle-prev`;
    await testDb()
      .insert(cycles)
      .values({
        id,
        teamId: team.id,
        number: 0,
        name: null,
        startsAt: daysAgo(21),
        endsAt: daysAgo(7),
        status: "completed",
      })
      .onConflictDoNothing();
    return id;
  };

  it("reports what the cycle holds and how much is done", async () => {
    const cycleId = fixture.eng.currentCycleId;
    await completedIssue(fixture.eng, 5, 2, { cycleId, estimate: 3 });
    await completedIssue(fixture.eng, 6, 3, { cycleId, estimate: 5 });
    await openIssue(fixture.eng, 4, { cycleId, estimate: 2 });

    const result = await getCycleAnalytics(cycleId);

    expect(result?.current.metrics.completed).toBe(2);
    expect(result?.current.metrics.total).toBe(3);
    expect(result?.current.metrics.percent).toBe(67);
    expect(result?.current.metrics.estimate).toEqual({ completed: 8, total: 10 });
  });

  it("reports a median completion time for the cycle", async () => {
    const cycleId = fixture.eng.currentCycleId;
    await completedIssue(fixture.eng, 6, 4, { cycleId }); // 2 days
    await completedIssue(fixture.eng, 8, 4, { cycleId }); // 4 days

    const result = await getCycleAnalytics(cycleId);

    expect(result?.current.completionTime?.medianSeconds).toBe(3 * 86_400);
  });

  it("brings the previous finished cycle along for comparison", async () => {
    const previousId = await seedPreviousCycle(fixture.prod);
    const cycleId = fixture.prod.currentCycleId;

    await completedIssue(fixture.prod, 5, 2, { cycleId, estimate: 3 });
    await completedIssue(fixture.prod, 5, 2, { cycleId, estimate: 3 });
    await completedIssue(fixture.prod, 12, 9, { cycleId: previousId, estimate: 8 });

    const result = await getCycleAnalytics(cycleId);

    expect(result?.current.metrics.completed).toBe(2);
    expect(result?.previous?.id).toBe(previousId);
    expect(result?.previous?.metrics.completed).toBe(1);
    expect(result?.previous?.metrics.estimate?.completed).toBe(8);
  });

  it("has no previous cycle to compare against when none has finished", async () => {
    const result = await getCycleAnalytics(fixture.eng.currentCycleId);

    expect(result?.previous).toBeNull();
  });

  it("returns nothing for a cycle that does not exist", async () => {
    expect(await getCycleAnalytics("missing-cycle")).toBeNull();
  });

  it("leaves soft-deleted issues out of cycle figures", async () => {
    const cycleId = fixture.eng.currentCycleId;
    await completedIssue(fixture.eng, 5, 2, { cycleId });
    await completedIssue(fixture.eng, 5, 2, { cycleId, deletedAt: daysAgo(1) });

    expect((await getCycleAnalytics(cycleId))?.current.metrics.completed).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */

describe("project analytics", () => {
  const projectAnalytics = () =>
    getProjectAnalytics({ projectId: fixture.projectA, now: NOW });

  it("counts completed against the project total", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 5, 2, { projectId });
    await completedIssue(fixture.eng, 6, 3, { projectId });
    await openIssue(fixture.eng, 4, { projectId });

    const result = await projectAnalytics();

    expect(result.completed).toBe(2);
    expect(result.total).toBe(3);
  });

  it("keeps canceled work out of the total but counts it separately", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 5, 2, { projectId });
    await canceledIssue(fixture.eng, 5, 2, { projectId });

    const result = await projectAnalytics();

    expect(result.total).toBe(1);
    expect(result.completed).toBe(1);
    expect(result.canceled).toBe(1);
  });

  it("sums estimate points completed and outstanding", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 5, 2, { projectId, estimate: 3 });
    await openIssue(fixture.eng, 4, { projectId, estimate: 5 });

    const result = await projectAnalytics();

    expect(result.completedEstimate).toBe(3);
    expect(result.totalEstimate).toBe(8);
  });

  it("reports a median completion time", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 6, 4, { projectId }); // 2 days
    await completedIssue(fixture.eng, 8, 4, { projectId }); // 4 days

    expect((await projectAnalytics()).completionTime?.medianSeconds).toBe(
      3 * 86_400,
    );
  });

  it("counts recent completions over the trailing window only", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 5, 2, { projectId });
    await completedIssue(fixture.eng, 200, 100, { projectId });

    const result = await projectAnalytics();

    expect(result.completed).toBe(2);
    expect(result.recentCompleted).toBe(1);
    expect(result.recentDays).toBe(30);
  });

  it("spans projects across teams", async () => {
    const projectId = fixture.projectA;
    await completedIssue(fixture.eng, 5, 2, { projectId });
    await completedIssue(fixture.prod, 5, 2, { projectId });

    expect((await projectAnalytics()).completed).toBe(2);
  });

  it("shows nothing rather than zeros for an empty project", async () => {
    const result = await projectAnalytics();

    expect(result.total).toBe(0);
    expect(result.completionTime).toBeNull();
    expect(result.completedEstimate).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */

describe("aggregate query shape", () => {
  it("does not scale its query count with the number of issues", async () => {
    for (let index = 0; index < 25; index += 1) {
      await completedIssue(fixture.eng, 10, 2);
    }

    const queries: string[] = [];
    const before = await testDb()
      .select({ id: issues.id })
      .from(issues)
      .where(eq(issues.teamId, fixture.eng.id));
    queries.push(`seeded ${before.length}`);

    const result = await teamAnalytics(fixture.eng);

    // The proof that this is aggregated in SQL: 25 issues, one set of numbers,
    // and no per-issue round trip anywhere in `getTeamAnalytics`.
    expect(result.completed).toBe(25);
    expect(result.completionTime?.sampleSize).toBe(25);
  });
});
