/**
 * Cycle maintenance. There is no cron: `syncTeamCycles` runs on every cycle
 * read, so the properties that matter are idempotency (ten calls do what one
 * call did) and that rollover is driven by the stored status transition rather
 * than by a flag.
 *
 * Every test passes an explicit `now`, so nothing here depends on when the
 * suite happens to run.
 */
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { cycles, issues, teams } from "../../../drizzle/schema";
import { syncTeamCycles } from "../../cycle-maintenance";
import {
  constraintViolation,
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

const days = (count: number) => new Date(NOW.getTime() + count * 86_400_000);

const cyclesOf = (teamId: string) =>
  testDb()
    .select()
    .from(cycles)
    .where(eq(cycles.teamId, teamId))
    .orderBy(asc(cycles.number));

const read = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

// This suite rewrites team settings and cycle rows, so it resets everything.
beforeEach(async () => {
  await resetTestDatabase();
  resetIssueCounter();
  fixture = await seedTestWorkspace();
});

describe("auto-create", () => {
  it("tops the team up to two upcoming cycles", async () => {
    // The fixture starts with one active and one upcoming cycle.
    await syncTeamCycles(fixture.eng.id, NOW);

    const rows = await cyclesOf(fixture.eng.id);
    const upcoming = rows.filter((cycle) => cycle.startsAt > NOW);
    expect(upcoming.length).toBeGreaterThanOrEqual(2);
  });

  it("creates nothing extra when run again", async () => {
    await syncTeamCycles(fixture.eng.id, NOW);
    const first = await cyclesOf(fixture.eng.id);

    await syncTeamCycles(fixture.eng.id, NOW);
    await syncTeamCycles(fixture.eng.id, NOW);

    expect(await cyclesOf(fixture.eng.id)).toHaveLength(first.length);
  });

  it("creates cycles with unique consecutive numbers", async () => {
    await syncTeamCycles(fixture.eng.id, NOW);

    const numbers = (await cyclesOf(fixture.eng.id)).map((c) => c.number);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
  });

  it("creates nothing when auto-create is off", async () => {
    await testDb()
      .update(teams)
      .set({ cycleAutoCreate: false })
      .where(eq(teams.id, fixture.eng.id));
    const before = await cyclesOf(fixture.eng.id);

    await syncTeamCycles(fixture.eng.id, NOW);

    expect(await cyclesOf(fixture.eng.id)).toHaveLength(before.length);
  });

  it("does nothing at all when cycles are disabled", async () => {
    await testDb()
      .update(teams)
      .set({ cyclesEnabled: false })
      .where(eq(teams.id, fixture.eng.id));
    const before = await cyclesOf(fixture.eng.id);

    const result = await syncTeamCycles(fixture.eng.id, days(60));

    expect(result.rolledOver).toBe(0);
    expect(await cyclesOf(fixture.eng.id)).toHaveLength(before.length);
  });
});

describe("rollover", () => {
  it("moves unfinished work into the next cycle when one ends", async () => {
    const open = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
    });

    // Ten days on, the fixture's active cycle has ended.
    const result = await syncTeamCycles(fixture.eng.id, days(10));

    expect(result.rolledOver).toBe(1);
    expect((await read(open.id)).cycleId).toBe(fixture.eng.nextCycleId);
  });

  it("leaves completed work in the cycle it was finished in", async () => {
    const done = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.done,
    });

    await syncTeamCycles(fixture.eng.id, days(10));

    expect((await read(done.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("leaves canceled work behind too", async () => {
    const canceled = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.canceled,
    });

    await syncTeamCycles(fixture.eng.id, days(10));

    expect((await read(canceled.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("ignores soft-deleted issues", async () => {
    const deleted = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
      deletedAt: NOW,
    });

    const result = await syncTeamCycles(fixture.eng.id, days(10));

    expect(result.rolledOver).toBe(0);
    expect((await read(deleted.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("moves nothing on a second run", async () => {
    await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
    });

    const first = await syncTeamCycles(fixture.eng.id, days(10));
    const second = await syncTeamCycles(fixture.eng.id, days(10));
    const third = await syncTeamCycles(fixture.eng.id, days(11));

    expect(first.rolledOver).toBe(1);
    expect(second.rolledOver).toBe(0);
    expect(third.rolledOver).toBe(0);
  });

  it("moves nothing when auto-rollover is off", async () => {
    await testDb()
      .update(teams)
      .set({ cycleAutoRollover: false })
      .where(eq(teams.id, fixture.eng.id));
    const open = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
    });

    const result = await syncTeamCycles(fixture.eng.id, days(10));

    expect(result.rolledOver).toBe(0);
    expect((await read(open.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("leaves work in place when there is no later cycle to move it to", async () => {
    await testDb()
      .update(teams)
      .set({ cycleAutoCreate: false })
      .where(eq(teams.id, fixture.eng.id));
    // Drop the upcoming cycle so the ending one has nowhere to hand off to.
    await testDb().delete(cycles).where(eq(cycles.id, fixture.eng.nextCycleId));
    const open = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
    });

    const result = await syncTeamCycles(fixture.eng.id, days(10));

    expect(result.rolledOver).toBe(0);
    expect((await read(open.id)).cycleId).toBe(fixture.eng.currentCycleId);
  });

  it("never moves work into another team's cycle", async () => {
    const engIssue = await createTestIssue(fixture.eng, {
      cycleId: fixture.eng.currentCycleId,
      statusId: fixture.eng.status.doing,
    });
    const prodIssue = await createTestIssue(fixture.prod, {
      cycleId: fixture.prod.currentCycleId,
      statusId: fixture.prod.status.doing,
    });

    await syncTeamCycles(fixture.eng.id, days(10));

    const engCycles = (await cyclesOf(fixture.eng.id)).map((c) => c.id);
    expect(engCycles).toContain((await read(engIssue.id)).cycleId);
    // Syncing ENG must not have touched PROD at all.
    expect((await read(prodIssue.id)).cycleId).toBe(fixture.prod.currentCycleId);
  });

  it("records the ended cycle as completed", async () => {
    await syncTeamCycles(fixture.eng.id, days(10));

    const [ended] = await testDb()
      .select()
      .from(cycles)
      .where(eq(cycles.id, fixture.eng.currentCycleId));
    expect(ended.status).toBe("completed");
  });
});

describe("database constraints", () => {
  it("rejects a duplicate cycle number on the same team", async () => {
    const message = await constraintViolation(
      testDb().insert(cycles).values({
        teamId: fixture.eng.id,
        number: 1,
        startsAt: NOW,
        endsAt: days(14),
        status: "upcoming",
      }),
    );

    expect(message).toMatch(/duplicate key/i);
    expect(message).toMatch(/cycles_team_number_idx/);
  });

  it("allows the same cycle number on a different team", async () => {
    // Both teams already have cycles 1 and 2 from the fixture, which is only
    // possible because the unique index is scoped to the team.
    const engNumbers = (await cyclesOf(fixture.eng.id)).map((c) => c.number);
    const prodNumbers = (await cyclesOf(fixture.prod.id)).map((c) => c.number);
    expect(engNumbers).toContain(1);
    expect(prodNumbers).toContain(1);
  });
});
