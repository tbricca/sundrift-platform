/**
 * Cycle membership history against real Postgres.
 *
 * Two things are being proven here. First, that every path which writes
 * `issues.cycle_id` leaves a truthful interval behind it — including rollover,
 * which is the case that motivated the table. Second, that the scope metrics
 * built on those intervals answer the planning questions honestly, and refuse
 * to answer at all for cycles older than the history boundary.
 *
 * Dates are fixed. Nothing sleeps.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import createIssue from "../../../actions/create-issue";
import updateIssue from "../../../actions/update-issue";
import bulkUpdateIssues from "../../../actions/bulk-update-issues";
import updateIssueTriage from "../../../actions/update-issue-triage";
import createTemplate from "../../../actions/create-issue-template";
import createRecurring from "../../../actions/create-recurring-issue";
import {
  cycles,
  issueCycleMemberships,
  issues,
  recurringIssueDefinitions,
  teams,
} from "../../../drizzle/schema";
import { syncTeamCycles } from "../../cycle-maintenance";
import { processRecurringIssues } from "../../recurring-issues";
import { cycleScope } from "../../cycle-scope";
import { resetTestDatabase, testDb } from "../../testing/database";
import {
  NOW,
  createTestIssue,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
  type TeamFixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const days = (count: number) => new Date(NOW.getTime() + count * 86_400_000);

const create = (args: Record<string, unknown>) =>
  createIssue.run(args as never);
const update = (args: Record<string, unknown>) =>
  updateIssue.run(args as never);

/** Every membership row for an issue, oldest first. */
const historyOf = (issueId: string) =>
  testDb()
    .select()
    .from(issueCycleMemberships)
    .where(eq(issueCycleMemberships.issueId, issueId))
    .orderBy(asc(issueCycleMemberships.addedAt));

const openFor = async (issueId: string) =>
  (
    await testDb()
      .select()
      .from(issueCycleMemberships)
      .where(
        and(
          eq(issueCycleMemberships.issueId, issueId),
          isNull(issueCycleMemberships.removedAt),
        ),
      )
  )[0];

const cyclesOf = (teamId: string) =>
  testDb()
    .select()
    .from(cycles)
    .where(eq(cycles.teamId, teamId))
    .orderBy(asc(cycles.number));

/**
 * Declares that this team's history is authoritative from `from`, so scope
 * metrics are allowed to report on cycles starting after it. The fixture's
 * cycles predate the real-clock default, which is what the availability tests
 * below rely on.
 */
const historyFrom = (teamId: string, from: Date) =>
  testDb()
    .update(teams)
    .set({ cycleHistoryStartedAt: from })
    .where(eq(teams.id, teamId));

/** Opens a membership directly, for building deterministic scope fixtures. */
const membership = (
  team: TeamFixture,
  issueId: string,
  cycleId: string,
  addedAt: Date,
  extra: Partial<typeof issueCycleMemberships.$inferInsert> = {},
) =>
  testDb()
    .insert(issueCycleMemberships)
    .values({ issueId, cycleId, teamId: team.id, addedAt, ...extra });

beforeEach(async () => {
  await resetTestDatabase();
  resetIssueCounter();
  fixture = await seedTestWorkspace();
});

/* -------------------------------------------------------------------------- */

describe("membership writes", () => {
  it("opens a membership when an issue is created into a cycle", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      title: "Planned from the start",
      cycleId: fixture.eng.currentCycleId,
    });

    const rows = await historyOf(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].cycleId).toBe(fixture.eng.currentCycleId);
    expect(rows[0].removedAt).toBeNull();
    expect(rows[0].addReason).toBe("created_in_cycle");
  });

  it("records nothing for an issue created without a cycle", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      title: "Unscheduled",
    });
    expect(await historyOf(created.id)).toHaveLength(0);
  });

  it("closes one interval and opens the next when the cycle changes", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-3),
    );

    await update({ identifier: issue.id, cycleId: fixture.eng.nextCycleId });

    const rows = await historyOf(issue.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].cycleId).toBe(fixture.eng.currentCycleId);
    expect(rows[0].removedAt).not.toBeNull();
    expect(rows[0].removeReason).toBe("cycle_changed");
    expect(rows[1].cycleId).toBe(fixture.eng.nextCycleId);
    expect(rows[1].removedAt).toBeNull();
  });

  it("closes the interval when the cycle is cleared", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-3),
    );

    await update({ identifier: issue.id, cycleId: null });

    const rows = await historyOf(issue.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt).not.toBeNull();
    expect(await openFor(issue.id)).toBeUndefined();
  });

  it("opens a first interval for an issue that had no cycle", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, cycleId: fixture.eng.currentCycleId });

    const rows = await historyOf(issue.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].cycleId).toBe(fixture.eng.currentCycleId);
    expect(rows[0].removedAt).toBeNull();
  });

  it("writes nothing when the issue is saved into the cycle it is already in", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      title: "Stays put",
      cycleId: fixture.eng.currentCycleId,
    });

    await update({
      identifier: created.id,
      cycleId: fixture.eng.currentCycleId,
      title: "Stays put, renamed",
    });

    const rows = await historyOf(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].removedAt).toBeNull();
  });

  it("refuses a second open interval for the same issue", async () => {
    const issue = await createTestIssue(fixture.eng);
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-3),
    );

    await expect(
      membership(fixture.eng, issue.id, fixture.eng.nextCycleId, days(-1)),
    ).rejects.toThrow();
  });

  it("records history for every issue in a bulk cycle move", async () => {
    const first = await createTestIssue(fixture.eng);
    const second = await createTestIssue(fixture.eng);

    await bulkUpdateIssues.run({
      issueIds: [first.id, second.id],
      cycleId: fixture.eng.nextCycleId,
    } as never);

    for (const issue of [first, second]) {
      const rows = await historyOf(issue.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].cycleId).toBe(fixture.eng.nextCycleId);
    }
  });

  it("records history for a bulk move onto the current cycle", async () => {
    const issue = await createTestIssue(fixture.eng);

    // cycleTarget resolves against the wall clock rather than the fixture's
    // fixed NOW, so the active cycle is moved to span this instant.
    const real = Date.now();
    await testDb()
      .update(cycles)
      .set({
        startsAt: new Date(real - 86_400_000),
        endsAt: new Date(real + 86_400_000),
      })
      .where(eq(cycles.id, fixture.eng.currentCycleId));

    await bulkUpdateIssues.run({
      issueIds: [issue.id],
      cycleTarget: "current",
    } as never);

    const open = await openFor(issue.id);
    expect(open.cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("leaves history alone when a cycle move is rejected", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      update({ identifier: issue.id, cycleId: fixture.prod.currentCycleId }),
    ).rejects.toThrow();

    expect(await historyOf(issue.id)).toHaveLength(0);
  });

  it("records history when triage accepts an issue into a cycle", async () => {
    const triaged = await createTestIssue(fixture.eng, {
      triageStatus: "pending",
    });

    await updateIssueTriage.run({
      identifier: triaged.id,
      action: "accept",
      cycleId: fixture.eng.currentCycleId,
    } as never);

    const open = await openFor(triaged.id);
    expect(open.cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("records history for a recurring issue filed into a cycle", async () => {
    const template = (await createTemplate.run({
      teamId: fixture.eng.id,
      name: "Weekly review",
      titleTemplate: "Weekly ingestion review",
    } as never)) as { id: string };

    const rule = (await createRecurring.run({
      teamId: fixture.eng.id,
      name: "Weekly ingestion review",
      templateId: template.id,
      cadence: "daily",
      timeOfDay: "09:00",
      timezone: "UTC",
      startsAt: NOW.toISOString(),
      cycleMode: "current_cycle",
    } as never)) as { id: string };

    await testDb()
      .update(recurringIssueDefinitions)
      .set({ nextRunAt: days(-1) })
      .where(eq(recurringIssueDefinitions.id, rule.id));

    await processRecurringIssues(new Date());

    const [generated] = await testDb()
      .select()
      .from(issues)
      .where(eq(issues.recurringDefinitionId, rule.id));

    const rows = await historyOf(generated.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].cycleId).toBe(generated.cycleId);
    // Automation is attributed, so mid-cycle additions can be explained.
    expect(rows[0].addReason).toBe("recurring");
  });
});

/* -------------------------------------------------------------------------- */

describe("rollover", () => {
  /** Puts the active cycle in the past so the next sync completes it. */
  const endTheCycle = () => syncTeamCycles(fixture.eng.id, days(10));

  it("closes the old interval and opens one in the destination", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.todo,
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-7),
    );

    await endTheCycle();

    const rows = await historyOf(issue.id);
    expect(rows).toHaveLength(2);
    expect(rows[0].removeReason).toBe("rollover");
    expect(rows[1].addReason).toBe("rollover");
    expect(rows[1].removedAt).toBeNull();

    // History agrees with the authoritative column.
    const [moved] = await testDb()
      .select()
      .from(issues)
      .where(eq(issues.id, issue.id));
    expect(rows[1].cycleId).toBe(moved.cycleId);
  });

  it("leaves a completed issue assigned to the cycle it finished in", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.done,
      completedAt: days(-1),
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-7),
    );

    await endTheCycle();

    const rows = await historyOf(issue.id);
    expect(rows).toHaveLength(1);
    // A cycle ending is not a removal. The issue is still assigned there.
    expect(rows[0].removedAt).toBeNull();
  });

  it("leaves a canceled issue behind too", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.canceled,
      canceledAt: days(-1),
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-7),
    );

    await endTheCycle();

    expect(await historyOf(issue.id)).toHaveLength(1);
  });

  it("does not duplicate history when maintenance runs again", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-7),
    );

    await endTheCycle();
    await endTheCycle();
    await endTheCycle();

    expect(await historyOf(issue.id)).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- */

describe("scope metrics", () => {
  /**
   * A deliberate, fully specified cycle:
   *
   *   A — committed, completed during the cycle
   *   B — committed, moved out on day four
   *   C — committed, still unfinished
   *   D — added on day two
   *
   * So: committed 3, of which 1 completed; 1 added; 1 removed.
   */
  const scenario = async () => {
    const [cycle] = await cyclesOf(fixture.eng.id);
    await historyFrom(fixture.eng.id, new Date(cycle.startsAt.getTime() - 1));
    const start = cycle.startsAt;
    const day = (n: number) => new Date(start.getTime() + n * 86_400_000);

    const a = await createTestIssue(fixture.eng, {
      cycleId: cycle.id,
      statusId: fixture.eng.status.done,
      completedAt: day(3),
      estimate: 3,
    });
    const b = await createTestIssue(fixture.eng, {
      cycleId: null,
      estimate: 5,
    });
    const c = await createTestIssue(fixture.eng, { cycleId: cycle.id });
    const d = await createTestIssue(fixture.eng, { cycleId: cycle.id });

    await membership(fixture.eng, a.id, cycle.id, day(-1));
    await membership(fixture.eng, b.id, cycle.id, day(-1), {
      removedAt: day(4),
      removeReason: "manual",
    });
    await membership(fixture.eng, c.id, cycle.id, day(-1));
    await membership(fixture.eng, d.id, cycle.id, day(2));

    return { cycle, a, b, c, d };
  };

  it("counts what was on the board when the cycle opened", async () => {
    const { cycle } = await scenario();
    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committed).toBe(3);
  });

  it("keeps work committed even after it is moved out", async () => {
    // B left on day four. Removing unfinished work must not flatter the
    // commitment, so the denominator stays at three.
    const { cycle } = await scenario();
    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committed).toBe(3);
    expect(scope.removed).toBe(1);
  });

  it("counts work that arrived mid-cycle as added, not committed", async () => {
    const { cycle } = await scenario();
    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.added).toBe(1);
  });

  it("scores completion against the original commitment", async () => {
    const { cycle } = await scenario();
    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committedCompleted).toBe(1);
    expect(scope.committedPercent).toBe(33);
  });

  it("does not credit a completion that landed after the cycle ended", async () => {
    const [cycle] = await cyclesOf(fixture.eng.id);
    await historyFrom(fixture.eng.id, new Date(cycle.startsAt.getTime() - 1));
    const issue = await createTestIssue(fixture.eng, {
      cycleId: cycle.id,
      statusId: fixture.eng.status.done,
      completedAt: new Date(cycle.endsAt.getTime() + 86_400_000),
    });
    await membership(
      fixture.eng,
      issue.id,
      cycle.id,
      new Date(cycle.startsAt.getTime() - 1000),
    );

    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committed).toBe(1);
    expect(scope.committedCompleted).toBe(0);
  });

  it("sums estimates over the commitment and ignores unestimated work", async () => {
    // A=3 completed, B=5 committed but unfinished, C and D unestimated.
    const { cycle } = await scenario();
    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.estimate).toEqual({ committed: 8, completed: 3 });
  });

  it("reports no estimate figures when nothing committed was estimated", async () => {
    const [cycle] = await cyclesOf(fixture.eng.id);
    await historyFrom(fixture.eng.id, new Date(cycle.startsAt.getTime() - 1));
    const issue = await createTestIssue(fixture.eng, { cycleId: cycle.id });
    await membership(
      fixture.eng,
      issue.id,
      cycle.id,
      new Date(cycle.startsAt.getTime() - 1000),
    );

    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.estimate).toBeNull();
  });

  it("counts carryover on both sides of a rollover", async () => {
    const issue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
    });
    await membership(
      fixture.eng,
      issue.id,
      fixture.eng.currentCycleId,
      days(-7),
    );
    await historyFrom(fixture.eng.id, days(-30));

    await syncTeamCycles(fixture.eng.id, days(10));

    const open = await openFor(issue.id);
    const scope = await cycleScope([fixture.eng.currentCycleId, open.cycleId]);

    expect(scope.get(fixture.eng.currentCycleId)!.carriedOut).toBe(1);
    expect(scope.get(open.cycleId)!.carriedIn).toBe(1);
  });

  it("leaves soft-deleted issues out of the commitment", async () => {
    const { cycle, c } = await scenario();
    await testDb()
      .update(issues)
      .set({ deletedAt: NOW })
      .where(eq(issues.id, c.id));

    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committed).toBe(2);
  });

  it("reports nothing at all for a cycle older than the history boundary", async () => {
    const { cycle } = await scenario();
    // History now starts after this cycle did, so its intervals are unreliable.
    await historyFrom(fixture.eng.id, new Date(cycle.startsAt.getTime() + 1));

    const scope = await cycleScope([cycle.id]);
    // Absent, not zeroed: the difference between "we know" and "we don't".
    expect(scope.has(cycle.id)).toBe(false);
  });

  it("reports zeros for an in-scope cycle that genuinely held nothing", async () => {
    const [cycle] = await cyclesOf(fixture.eng.id);
    await historyFrom(fixture.eng.id, new Date(cycle.startsAt.getTime() - 1));

    const scope = (await cycleScope([cycle.id])).get(cycle.id)!;
    expect(scope.committed).toBe(0);
    expect(scope.committedPercent).toBeNull();
  });
});
