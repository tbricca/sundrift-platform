/**
 * Turning recurring rules into issues.
 *
 * TRIGGERING
 *
 * Beam has no cron, no queue and no worker process — the same constraint that
 * shaped `server/cycle-maintenance.ts`. So this follows the pattern already
 * established there: processing is read-triggered. Anything that lists or reads
 * recurring rules brings them up to date first, and the team's issue list does
 * too, so simply using Beam generates the work.
 *
 * The honest consequence: a rule fires the next time somebody opens Beam after
 * it comes due, not at the instant on the clock. For "weekly ingestion review"
 * that is fine. It is not a real-time scheduler and is not documented as one.
 * If Beam ever gains a cron, `processRecurringIssues` is the single entry point
 * to call, and nothing else has to change.
 *
 * IDEMPOTENCY
 *
 * The unique index on `(definition_id, scheduled_for)` is the lock. A processor
 * claims an occurrence with `INSERT ... ON CONFLICT DO NOTHING`; exactly one
 * caller gets a row back and everyone else gets nothing and skips. Two
 * processors racing therefore produce one issue, with no transaction, no
 * advisory lock and nothing for the application to get wrong. This is the same
 * reasoning that makes `syncTeamCycles` safe to call from every read.
 *
 * MISSED RUNS
 *
 * If Beam is unused for a month, a daily rule does not then create thirty
 * issues. Each pass fires at most ONE occurrence per rule — the most recent one
 * that is due — and then advances `next_run_at` past everything older. A stale
 * backlog is noise; the current occurrence is the useful one. Skipped slots are
 * not recorded, because they never became work.
 */
import { and, asc, eq, isNotNull, isNull, lte } from "drizzle-orm";

import createIssue from "../actions/create-issue";
import {
  isValidTimeZone,
  nextOccurrence,
  type Schedule,
} from "../app/lib/recurrence";
import {
  cycles,
  issueTemplates,
  recurringIssueDefinitions,
  recurringIssueRuns,
} from "../drizzle/schema";

import { db } from "./db";

export type RecurringDefinition =
  typeof recurringIssueDefinitions.$inferSelect;

/** One pass processes at most this many rules, so work stays bounded. */
const MAX_PER_PASS = 50;

export type ProcessResult = {
  processed: number;
  created: number;
  failed: number;
};

/* -------------------------------------------------------------------------- */
/* Schedule plumbing                                                          */
/* -------------------------------------------------------------------------- */

/** The stored row, in the shape the pure schedule engine expects. */
export function scheduleOf(definition: RecurringDefinition): Schedule {
  return {
    cadence: definition.cadence,
    interval: definition.interval,
    weekdays: definition.weekdays ?? null,
    dayOfMonth: definition.dayOfMonth ?? null,
    timeOfDay: definition.timeOfDay,
    timeZone: definition.timezone,
    startsAt: definition.startsAt,
    endsAt: definition.endsAt,
  };
}

/**
 * Where `next_run_at` should sit for a rule, measured from `from`.
 *
 * Used on create, on every edit, and when a rule is re-enabled — which is what
 * makes re-enabling resume from now instead of replaying the gap.
 */
export function computeNextRun(
  definition: RecurringDefinition,
  from: Date,
): Date | null {
  return nextOccurrence(scheduleOf(definition), from);
}

/**
 * Reject a schedule that cannot mean anything, before it reaches the database.
 *
 * Shared by create and update so a rule cannot be edited into a state it could
 * never have been created in.
 */
export function validateSchedule(input: {
  cadence: string;
  interval: number;
  weekdays?: number[] | null;
  dayOfMonth?: number | null;
  timeOfDay: string;
  timezone: string;
  startsAt: Date;
  endsAt?: Date | null;
}): string | null {
  if (!isValidTimeZone(input.timezone)) {
    return `"${input.timezone}" is not a known time zone.`;
  }
  if (!/^\d{2}:\d{2}$/.test(input.timeOfDay)) {
    return "Time of day must look like 09:00.";
  }
  const [hour, minute] = input.timeOfDay.split(":").map(Number);
  if (hour > 23 || minute > 59) {
    return "Time of day must be a real time.";
  }
  if (!Number.isInteger(input.interval) || input.interval < 1) {
    return "Interval must be a whole number of at least 1.";
  }
  if (input.cadence === "weekly" && input.weekdays?.length) {
    if (input.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
      return "Weekdays must be between 0 (Sunday) and 6 (Saturday).";
    }
  }
  if (input.cadence === "monthly") {
    const day = input.dayOfMonth ?? 1;
    if (!Number.isInteger(day) || day < 1 || day > 31) {
      return "Day of month must be between 1 and 31.";
    }
  }
  if (input.endsAt && input.endsAt.getTime() <= input.startsAt.getTime()) {
    return "The end date must be after the start date.";
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Processing                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Fire every rule that is due.
 *
 * `now` is a parameter so tests drive the clock. One rule failing never stops
 * another: each is processed in its own try/catch and records its own outcome.
 */
export async function processRecurringIssues(
  now: Date = new Date(),
  options: { teamId?: string } = {},
): Promise<ProcessResult> {
  const due = await db
    .select()
    .from(recurringIssueDefinitions)
    .where(
      and(
        eq(recurringIssueDefinitions.enabled, true),
        isNull(recurringIssueDefinitions.archivedAt),
        isNotNull(recurringIssueDefinitions.nextRunAt),
        lte(recurringIssueDefinitions.nextRunAt, now),
        options.teamId
          ? eq(recurringIssueDefinitions.teamId, options.teamId)
          : undefined,
      ),
    )
    .orderBy(asc(recurringIssueDefinitions.nextRunAt))
    .limit(MAX_PER_PASS);

  const result: ProcessResult = { processed: 0, created: 0, failed: 0 };

  for (const definition of due) {
    try {
      const outcome = await fireOnce(definition, now);
      result.processed += 1;
      if (outcome === "created") result.created += 1;
      if (outcome === "failed") result.failed += 1;
    } catch (error) {
      // A rule that cannot even be claimed must not stop the others.
      result.failed += 1;
      console.error(
        `[recurring] ${definition.id} could not be processed`,
        error,
      );
    }
  }

  return result;
}

type Outcome = "created" | "failed" | "skipped";

/**
 * Fire the single occurrence a rule currently owes, then move it forward.
 *
 * `next_run_at` is advanced whether the issue was created or not: a rule whose
 * template was archived should surface one clear failure per occurrence, not
 * retry in a loop every time somebody loads a page.
 */
async function fireOnce(
  definition: RecurringDefinition,
  now: Date,
): Promise<Outcome> {
  const scheduledFor = definition.nextRunAt;
  if (!scheduledFor) return "skipped";

  // Claim it. Losing this race means another processor already has the slot.
  const [claim] = await db
    .insert(recurringIssueRuns)
    .values({ definitionId: definition.id, scheduledFor, status: "pending" })
    .onConflictDoNothing()
    .returning({ id: recurringIssueRuns.id });

  if (!claim) {
    // Someone else owns this occurrence. Still make sure the rule moves on, in
    // case the winner has not got there yet; the update is idempotent.
    await advance(definition, scheduledFor, now, { touchLastRun: false });
    return "skipped";
  }

  try {
    const issueId = await createFromDefinition(definition);
    await db
      .update(recurringIssueRuns)
      .set({ status: "succeeded", issueId })
      .where(eq(recurringIssueRuns.id, claim.id));
    await advance(definition, scheduledFor, now, { touchLastRun: true });
    return "created";
  } catch (error) {
    // The run row carries a short reason for the UI; the log carries the stack,
    // which is the only way to diagnose a rule that fails for everyone.
    console.error(`[recurring] ${definition.id} failed to create an issue`, error);
    await db
      .update(recurringIssueRuns)
      .set({ status: "failed", error: describeError(error) })
      .where(eq(recurringIssueRuns.id, claim.id));
    await advance(definition, scheduledFor, now, { touchLastRun: true });
    return "failed";
  }
}

/**
 * Move `next_run_at` past everything already due.
 *
 * Walking forward from `now` rather than from the occurrence just fired is what
 * collapses a backlog: however long Beam was idle, the rule lands on its next
 * future slot instead of queueing up the ones it slept through.
 */
async function advance(
  definition: RecurringDefinition,
  firedAt: Date,
  now: Date,
  options: { touchLastRun: boolean },
): Promise<void> {
  const from = now.getTime() > firedAt.getTime() ? now : firedAt;
  const next = computeNextRun(definition, from);

  await db
    .update(recurringIssueDefinitions)
    .set({
      nextRunAt: next,
      updatedAt: new Date(),
      ...(options.touchLastRun ? { lastRunAt: firedAt } : {}),
    })
    // Only if the rule still points at the occurrence we handled, so a slower
    // processor cannot rewind a rule another one has already moved on.
    .where(
      and(
        eq(recurringIssueDefinitions.id, definition.id),
        eq(recurringIssueDefinitions.nextRunAt, firedAt),
      ),
    );
}

/* -------------------------------------------------------------------------- */
/* Issue creation                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Create the issue through the ordinary `create-issue` action.
 *
 * Not a direct insert: going through the action is what keeps team, status,
 * project, cycle and milestone validation, label handling, activity, mentions,
 * notifications and realtime identical to an issue somebody typed by hand. A
 * generated issue is not a special kind of issue.
 */
export async function createFromDefinition(
  definition: RecurringDefinition,
): Promise<string> {
  const template = definition.templateId
    ? (
        await db
          .select()
          .from(issueTemplates)
          .where(eq(issueTemplates.id, definition.templateId))
          .limit(1)
      )[0]
    : null;

  if (definition.templateId && !template) {
    throw new Error("The template this rule uses no longer exists.");
  }
  if (template?.archivedAt) {
    throw new Error(`Template "${template.name}" is archived.`);
  }
  if (template && template.teamId !== definition.teamId) {
    throw new Error("The template belongs to a different team.");
  }

  const cycleId = await resolveCycle(definition);

  const created = await createIssue.run({
    teamId: definition.teamId,
    // The template's own title wins when it has one; the rule's name is the
    // fallback so a template without a title still produces something readable.
    title: template?.titleTemplate?.trim() || definition.name,
    templateId: definition.templateId ?? undefined,
    // Rule-level overrides sit above the template, matching how an explicit
    // argument beats a template default everywhere else in Beam.
    assigneeId: definition.assigneeId ?? undefined,
    projectId: definition.projectId ?? undefined,
    cycleId,
    source: "recurring",
    recurringDefinitionId: definition.id,
  } as Parameters<typeof createIssue.run>[0]);

  return (created as { id: string }).id;
}

/**
 * Turn the rule's cycle intent into a cycle id at creation time.
 *
 * Storing an id would rot: cycles finish, and a rule pinned to cycle 12 would
 * keep filing into a closed one. `none` leaves the field alone so the template
 * or Beam's own defaults decide.
 */
async function resolveCycle(
  definition: RecurringDefinition,
): Promise<string | undefined> {
  if (definition.cycleMode === "none") return undefined;

  // A team has no "current cycle" column: the cycle rows carry the state, and
  // `syncTeamCycles` keeps it accurate. Reading it here means the answer is
  // always the cycle the rest of Beam considers current, with nothing to sync.
  const wanted =
    definition.cycleMode === "current_cycle" ? "active" : "upcoming";

  const [cycle] = await db
    .select({ id: cycles.id })
    .from(cycles)
    .where(
      and(eq(cycles.teamId, definition.teamId), eq(cycles.status, wanted)),
    )
    .orderBy(asc(cycles.number))
    .limit(1);

  // No open cycle is not an error: the issue is simply created without one.
  return cycle?.id;
}

/** A short reason, suitable for a table cell. */
function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 300);
}

/* -------------------------------------------------------------------------- */
/* Manual run                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * "Run now".
 *
 * Explicitly NOT the same event as a scheduled occurrence: it records a run row
 * with a null `scheduled_for` and leaves `next_run_at` untouched. Asking for an
 * issue today does not mean skipping Monday's, and because Postgres treats
 * nulls as distinct in a unique index, a manual run can never collide with a
 * scheduled slot.
 */
export async function runDefinitionNow(
  definition: RecurringDefinition,
): Promise<{ issueId: string | null; error: string | null }> {
  const [run] = await db
    .insert(recurringIssueRuns)
    .values({ definitionId: definition.id, manual: true, status: "pending" })
    .returning({ id: recurringIssueRuns.id });

  try {
    const issueId = await createFromDefinition(definition);
    await db
      .update(recurringIssueRuns)
      .set({ status: "succeeded", issueId })
      .where(eq(recurringIssueRuns.id, run.id));
    return { issueId, error: null };
  } catch (error) {
    const message = describeError(error);
    await db
      .update(recurringIssueRuns)
      .set({ status: "failed", error: message })
      .where(eq(recurringIssueRuns.id, run.id));
    return { issueId: null, error: message };
  }
}
