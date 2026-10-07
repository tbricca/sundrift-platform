/**
 * Recurring issues against real Postgres.
 *
 * The interesting property is not that a rule creates an issue — it is that it
 * creates exactly one, however many times the processor runs, and that a rule
 * which cannot fire fails loudly without taking its neighbours down. Those are
 * database-level guarantees (a unique index and a conditional update), so they
 * can only be proved here.
 *
 * Every test drives the clock explicitly. Nothing sleeps.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import createRecurring from "../../../actions/create-recurring-issue";
import createTemplate from "../../../actions/create-issue-template";
import getRecurring from "../../../actions/get-recurring-issue";
import listRecurring from "../../../actions/list-recurring-issues";
import runNow from "../../../actions/run-recurring-issue-now";
import updateRecurring from "../../../actions/update-recurring-issue";
import {
  activities,
  issueLabels,
  issueTemplates,
  issues,
  recurringIssueDefinitions,
  recurringIssueRuns,
} from "../../../drizzle/schema";
import { processRecurringIssues, runDefinitionNow } from "../../recurring-issues";
import { resetIssueData, resetTestDatabase, testDb } from "../../testing/database";
import {
  NOW,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const DAY = 86_400_000;
const at = (offsetDays: number) => new Date(NOW.getTime() + offsetDays * DAY);

const createTpl = (args: Record<string, unknown> = {}) =>
  createTemplate.run({
    teamId: fixture.eng.id,
    name: "Weekly review",
    titleTemplate: "Weekly ingestion review",
    ...args,
  } as never) as Promise<{ id: string }>;

const createRule = (args: Record<string, unknown>) =>
  createRecurring.run({
    teamId: fixture.eng.id,
    name: "Weekly ingestion review",
    cadence: "daily",
    timeOfDay: "09:00",
    timezone: "UTC",
    startsAt: NOW.toISOString(),
    ...args,
  } as never) as Promise<{ id: string; nextRunAt: string | null }>;

const update = (args: Record<string, unknown>) =>
  updateRecurring.run(args as never);

const readRule = async (id: string) =>
  (
    await testDb()
      .select()
      .from(recurringIssueDefinitions)
      .where(eq(recurringIssueDefinitions.id, id))
  )[0];

const runsOf = async (id: string) =>
  await testDb()
    .select()
    .from(recurringIssueRuns)
    .where(eq(recurringIssueRuns.definitionId, id));

const issuesOf = async (id: string) =>
  await testDb()
    .select()
    .from(issues)
    .where(eq(issues.recurringDefinitionId, id));

/**
 * The issue a rule generated, or a failure naming the reason it did not.
 * A bare "undefined" here would hide the error the run already recorded.
 */
const generatedIssue = async (id: string) => {
  const created = await issuesOf(id);
  if (created.length === 0) {
    const [run] = await runsOf(id);
    throw new Error(
      `No issue generated. Run status ${run?.status ?? "none"}: ${run?.error ?? "no run row"}`,
    );
  }
  return created[0];
};

/** Puts a rule's next occurrence in the past so the next pass fires it. */
const makeDue = async (id: string, when: Date) => {
  await testDb()
    .update(recurringIssueDefinitions)
    .set({ nextRunAt: when })
    .where(eq(recurringIssueDefinitions.id, id));
};

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  await testDb().delete(recurringIssueRuns);
  await testDb().delete(recurringIssueDefinitions);
  await testDb().delete(issueTemplates);
  resetIssueCounter();
});

/* -------------------------------------------------------------------------- */

describe("defining a rule", () => {
  it("stores the schedule and computes the first occurrence", async () => {
    const template = await createTpl();
    const rule = await createRule({
      templateId: template.id,
      cadence: "weekly",
      weekdays: [1],
      timeOfDay: "10:00",
      timezone: "America/Los_Angeles",
    });

    const stored = await readRule(rule.id);

    expect(stored.cadence).toBe("weekly");
    expect(stored.weekdays).toEqual([1]);
    expect(stored.timezone).toBe("America/Los_Angeles");
    expect(stored.enabled).toBe(true);
    expect(stored.nextRunAt).not.toBeNull();
    // 10:00 in Los Angeles is 17:00 or 18:00 UTC depending on the season.
    expect(stored.nextRunAt!.getUTCDay()).toBe(1);
  });

  it("refuses a template from another team", async () => {
    const template = await createTemplate.run({
      teamId: fixture.prod.id,
      name: "Other team",
    } as never);

    await expect(
      createRule({ templateId: (template as { id: string }).id }),
    ).rejects.toThrow(/different team/i);
  });

  it("refuses an unknown time zone", async () => {
    const template = await createTpl();

    await expect(
      createRule({ templateId: template.id, timezone: "Mars/Olympus_Mons" }),
    ).rejects.toThrow(/time zone/i);
  });

  it("refuses an end date before the start", async () => {
    const template = await createTpl();

    await expect(
      createRule({
        templateId: template.id,
        startsAt: at(5).toISOString(),
        endsAt: at(1).toISOString(),
      }),
    ).rejects.toThrow(/after the start/i);
  });
});

describe("firing a due rule", () => {
  it("creates exactly one normal issue", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    const result = await processRecurringIssues(NOW);

    expect(result.created).toBe(1);
    const created = await issuesOf(rule.id);
    expect(created).toHaveLength(1);
    expect(created[0].teamId).toBe(fixture.eng.id);
    expect(created[0].title).toBe("Weekly ingestion review");
  });

  it("records the run and links the issue it produced", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    const due = at(-1);
    await makeDue(rule.id, due);

    await processRecurringIssues(NOW);

    const runs = await runsOf(rule.id);
    expect(runs).toHaveLength(1);
    expect(runs[0].status).toBe("succeeded");
    expect(runs[0].scheduledFor?.toISOString()).toBe(due.toISOString());
    expect(runs[0].issueId).toBe((await issuesOf(rule.id))[0].id);
  });

  it("marks the issue with the rule that generated it", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    const [issue] = await issuesOf(rule.id);

    expect(issue.recurringDefinitionId).toBe(rule.id);

    const [created] = await testDb()
      .select()
      .from(activities)
      .where(eq(activities.issueId, issue.id));
    expect(created.metadata).toMatchObject({
      source: "recurring_issue",
      recurringDefinitionId: rule.id,
      recurringDefinitionName: "Weekly ingestion review",
    });
  });

  it("advances the schedule past the occurrence it fired", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    const stored = await readRule(rule.id);
    expect(stored.lastRunAt?.toISOString()).toBe(at(-1).toISOString());
    expect(stored.nextRunAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("leaves a rule that is not due yet alone", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(3));

    const result = await processRecurringIssues(NOW);

    expect(result.processed).toBe(0);
    expect(await issuesOf(rule.id)).toHaveLength(0);
  });
});

describe("idempotency", () => {
  it("does not create a second issue when processed again", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    await processRecurringIssues(NOW);
    await processRecurringIssues(NOW);

    expect(await issuesOf(rule.id)).toHaveLength(1);
  });

  it("creates one issue when two processors race the same occurrence", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await Promise.all([
      processRecurringIssues(NOW),
      processRecurringIssues(NOW),
      processRecurringIssues(NOW),
    ]);

    expect(await issuesOf(rule.id)).toHaveLength(1);
    const runs = await runsOf(rule.id);
    expect(runs.filter((run) => run.scheduledFor !== null)).toHaveLength(1);
  });

  it("rejects a duplicate claim for the same occurrence at the database level", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    const slot = at(-1);

    await testDb()
      .insert(recurringIssueRuns)
      .values({ definitionId: rule.id, scheduledFor: slot });

    const [second] = await testDb()
      .insert(recurringIssueRuns)
      .values({ definitionId: rule.id, scheduledFor: slot })
      .onConflictDoNothing()
      .returning();

    expect(second).toBeUndefined();
  });

  it("creates separate issues for separate occurrences", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });

    await makeDue(rule.id, at(-2));
    await processRecurringIssues(at(-2));

    await makeDue(rule.id, at(-1));
    await processRecurringIssues(at(-1));

    expect(await issuesOf(rule.id)).toHaveLength(2);
    expect(await runsOf(rule.id)).toHaveLength(2);
  });
});

describe("missed runs", () => {
  it("fires once rather than backfilling a month of occurrences", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    // Daily rule that nobody has triggered for three weeks.
    await makeDue(rule.id, at(-21));

    await processRecurringIssues(NOW);

    expect(await issuesOf(rule.id)).toHaveLength(1);
  });

  it("lands the next run in the future after a long gap", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-21));

    await processRecurringIssues(NOW);

    const stored = await readRule(rule.id);
    expect(stored.nextRunAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("still only creates one issue when processed repeatedly after a gap", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-21));

    await processRecurringIssues(NOW);
    await processRecurringIssues(NOW);

    expect(await issuesOf(rule.id)).toHaveLength(1);
  });
});

describe("enabled, disabled and archived", () => {
  it("does not fire while disabled", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id, enabled: false });
    await makeDue(rule.id, at(-1));

    const result = await processRecurringIssues(NOW);

    expect(result.processed).toBe(0);
    expect(await issuesOf(rule.id)).toHaveLength(0);
  });

  it("recalculates from now when re-enabled instead of replaying the gap", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id, enabled: false });
    await makeDue(rule.id, at(-21));

    await update({ id: rule.id, enabled: true });

    const stored = await readRule(rule.id);
    expect(stored.enabled).toBe(true);
    expect(stored.nextRunAt!.getTime()).toBeGreaterThan(Date.now());

    await processRecurringIssues(NOW);
    expect(await issuesOf(rule.id)).toHaveLength(0);
  });

  it("does not fire once archived", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await update({ id: rule.id, archived: true });
    await makeDue(rule.id, at(-1));

    const result = await processRecurringIssues(NOW);

    expect(result.processed).toBe(0);
  });

  it("keeps issues an archived rule already generated", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));
    await processRecurringIssues(NOW);

    await update({ id: rule.id, archived: true });

    const remaining = await issuesOf(rule.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].deletedAt).toBeNull();
    expect(await runsOf(rule.id)).toHaveLength(1);
  });

  it("restores an archived rule", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });

    await update({ id: rule.id, archived: true });
    await update({ id: rule.id, archived: false });

    expect((await readRule(rule.id)).archivedAt).toBeNull();
  });
});

describe("template application", () => {
  it("uses the template's fields for the generated issue", async () => {
    const template = await createTpl({
      titleTemplate: "Ingestion review",
      issueDescription: "Check yesterday's batches.",
      priority: "high",
      estimate: 3,
      labelIds: [fixture.labelBug],
    });
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    const [issue] = await issuesOf(rule.id);

    expect(issue.title).toBe("Ingestion review");
    expect(issue.description).toBe("Check yesterday's batches.");
    expect(issue.priority).toBe("high");
    expect(issue.estimate).toBe(3);

    const labels = await testDb()
      .select()
      .from(issueLabels)
      .where(eq(issueLabels.issueId, issue.id));
    expect(labels.map((row) => row.labelId)).toEqual([fixture.labelBug]);
  });

  it("picks up template edits rather than a snapshot taken at creation", async () => {
    const template = await createTpl({ titleTemplate: "Original title" });
    const rule = await createRule({ templateId: template.id });

    await testDb()
      .update(issueTemplates)
      .set({ titleTemplate: "Renamed title" })
      .where(eq(issueTemplates.id, template.id));

    await makeDue(rule.id, at(-1));
    await processRecurringIssues(NOW);

    expect((await issuesOf(rule.id))[0].title).toBe("Renamed title");
  });

  it("resolves the template's due-date offset at creation time", async () => {
    const template = await createTpl({ dueDateOffsetDays: 7 });
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    const [issue] = await issuesOf(rule.id);

    expect(issue.dueDate).not.toBeNull();
    // Seven days from when the issue was made, not from the schedule's start.
    const days = Math.round(
      (issue.dueDate!.getTime() - Date.now()) / DAY,
    );
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("lets a rule override the template's assignee", async () => {
    const template = await createTpl({ assigneeId: fixture.humanA });
    const rule = await createRule({
      templateId: template.id,
      assigneeId: fixture.agentA,
    });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    expect((await issuesOf(rule.id))[0].assigneeId).toBe(fixture.agentA);
  });

  it("falls back to the rule's name when the template has no title", async () => {
    const template = await createTpl({ titleTemplate: null });
    const rule = await createRule({
      templateId: template.id,
      name: "Fortnightly audit",
    });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    expect((await issuesOf(rule.id))[0].title).toBe("Fortnightly audit");
  });
});

describe("cycle modes", () => {
  it("leaves the cycle alone by default", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    expect((await issuesOf(rule.id))[0].cycleId).toBeNull();
  });

  it("files into the team's current cycle", async () => {
    const template = await createTpl();
    const rule = await createRule({
      templateId: template.id,
      cycleMode: "current_cycle",
    });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    expect((await generatedIssue(rule.id)).cycleId).toBe(
      fixture.eng.currentCycleId,
    );
  });

  it("files into the team's next cycle", async () => {
    const template = await createTpl();
    const rule = await createRule({
      templateId: template.id,
      cycleMode: "next_cycle",
    });
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);

    expect((await generatedIssue(rule.id)).cycleId).toBe(fixture.eng.nextCycleId);
  });

  it("resolves the cycle for the rule's own team", async () => {
    const template = await createTemplate.run({
      teamId: fixture.prod.id,
      name: "Prod review",
      titleTemplate: "Prod review",
    } as never);
    const rule = await createRecurring.run({
      teamId: fixture.prod.id,
      name: "Prod review",
      templateId: (template as { id: string }).id,
      cadence: "daily",
      timezone: "UTC",
      cycleMode: "current_cycle",
      startsAt: NOW.toISOString(),
    } as never);
    await makeDue((rule as { id: string }).id, at(-1));

    await processRecurringIssues(NOW);
    const issue = await generatedIssue((rule as { id: string }).id);

    expect(issue.cycleId).toBe(fixture.prod.currentCycleId);
    expect(issue.cycleId).not.toBe(fixture.eng.currentCycleId);
  });
});

describe("failure handling", () => {
  it("fails the run without creating an issue when the template is archived", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, template.id));
    await makeDue(rule.id, at(-1));

    const result = await processRecurringIssues(NOW);

    expect(result.failed).toBe(1);
    expect(await issuesOf(rule.id)).toHaveLength(0);

    const [run] = await runsOf(rule.id);
    expect(run.status).toBe("failed");
    expect(run.error).toMatch(/archived/i);
  });

  it("keeps a failing rule enabled and scheduled", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, template.id));
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    const stored = await readRule(rule.id);

    expect(stored.enabled).toBe(true);
    expect(stored.nextRunAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("does not retry the same failed occurrence on the next pass", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, template.id));
    await makeDue(rule.id, at(-1));

    await processRecurringIssues(NOW);
    await processRecurringIssues(NOW);

    expect(await runsOf(rule.id)).toHaveLength(1);
  });

  it("still processes other rules when one fails", async () => {
    const broken = await createTpl({ name: "Broken" });
    const healthy = await createTpl({ name: "Healthy", titleTemplate: "Healthy issue" });

    const failing = await createRule({ templateId: broken.id, name: "Failing" });
    const working = await createRule({ templateId: healthy.id, name: "Working" });

    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, broken.id));

    await makeDue(failing.id, at(-2));
    await makeDue(working.id, at(-1));

    const result = await processRecurringIssues(NOW);

    expect(result.failed).toBe(1);
    expect(result.created).toBe(1);
    expect(await issuesOf(failing.id)).toHaveLength(0);
    expect(await issuesOf(working.id)).toHaveLength(1);
  });
});

describe("run now", () => {
  it("creates an issue immediately", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });

    const outcome = await runNow.run({ id: rule.id } as never);

    expect((outcome as { issueId: string }).issueId).toBeTruthy();
    expect(await issuesOf(rule.id)).toHaveLength(1);
  });

  it("does not consume the next scheduled occurrence", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    const before = (await readRule(rule.id)).nextRunAt;

    await runNow.run({ id: rule.id } as never);

    const after = await readRule(rule.id);
    expect(after.nextRunAt?.toISOString()).toBe(before?.toISOString());
  });

  it("still fires the scheduled occurrence afterwards", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });

    await runNow.run({ id: rule.id } as never);
    await makeDue(rule.id, at(-1));
    await processRecurringIssues(NOW);

    expect(await issuesOf(rule.id)).toHaveLength(2);
  });

  it("records manual runs without colliding with each other", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });

    await runNow.run({ id: rule.id } as never);
    await runNow.run({ id: rule.id } as never);

    const runs = await runsOf(rule.id);
    expect(runs).toHaveLength(2);
    expect(runs.every((run) => run.manual && run.scheduledFor === null)).toBe(
      true,
    );
  });

  it("works on a disabled rule, because asking explicitly is the point", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id, enabled: false });

    await runNow.run({ id: rule.id } as never);

    expect(await issuesOf(rule.id)).toHaveLength(1);
  });

  it("refuses an archived rule", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await update({ id: rule.id, archived: true });

    await expect(runNow.run({ id: rule.id } as never)).rejects.toThrow(
      /archived/i,
    );
  });

  it("reports a failure without throwing from the helper", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, template.id));

    const outcome = await runDefinitionNow(await readRule(rule.id));

    expect(outcome.issueId).toBeNull();
    expect(outcome.error).toMatch(/archived/i);
  });
});

describe("reading rules", () => {
  it("lists a team's rules with the template name", async () => {
    const template = await createTpl({ name: "Review template" });
    await createRule({ templateId: template.id });

    const listed = (await listRecurring.run({
      teamKey: "ENG",
    } as never)) as { definitions: Array<Record<string, unknown>> };

    expect(listed.definitions).toHaveLength(1);
    expect(listed.definitions[0].templateName).toBe("Review template");
    expect(listed.definitions[0].enabled).toBe(true);
  });

  it("hides archived rules unless asked", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await update({ id: rule.id, archived: true });

    const hidden = (await listRecurring.run({ teamKey: "ENG" } as never)) as {
      definitions: unknown[];
    };
    const shown = (await listRecurring.run({
      teamKey: "ENG",
      includeArchived: true,
    } as never)) as { definitions: unknown[] };

    expect(hidden.definitions).toHaveLength(0);
    expect(shown.definitions).toHaveLength(1);
  });

  it("flags a rule whose template has been archived", async () => {
    const template = await createTpl();
    await createRule({ templateId: template.id });
    await testDb()
      .update(issueTemplates)
      .set({ archivedAt: NOW })
      .where(eq(issueTemplates.id, template.id));

    const listed = (await listRecurring.run({ teamKey: "ENG" } as never)) as {
      definitions: Array<{ templateArchived: boolean }>;
    };

    expect(listed.definitions[0].templateArchived).toBe(true);
  });

  it("returns run history with the identifier of each created issue", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));
    await processRecurringIssues(NOW);

    const detail = (await getRecurring.run({ id: rule.id } as never)) as {
      runs: Array<{ status: string; identifier: string | null }>;
    };

    expect(detail.runs).toHaveLength(1);
    expect(detail.runs[0].status).toBe("succeeded");
    expect(detail.runs[0].identifier).toMatch(/^ENG-\d+$/);
  });

  it("processes due rules as a side effect of listing them", async () => {
    const template = await createTpl();
    const rule = await createRule({ templateId: template.id });
    await makeDue(rule.id, at(-1));

    await listRecurring.run({ teamKey: "ENG" } as never);

    expect(await issuesOf(rule.id)).toHaveLength(1);
  });
});
