import { defineAction } from "@agent-native/core/action";
import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier } from "../app/lib/issue-query";
import { applyTemplate } from "../app/lib/issue-template";
import { parseMentionIds } from "../app/lib/mentions";
import {
  activities,
  cycles,
  issueLabels,
  issues,
  recurringIssueDefinitions,
  teams,
  workflowStatuses,
} from "../drizzle/schema";
import { db } from "../server/db";
import { openMembership } from "../server/issue-cycle-membership";
import { prioritySchema } from "../server/issue-query-schema";
import { requireTemplate, templateDefaults } from "../server/issue-templates";
import { publishIssueChange } from "../server/realtime";
import {
  UserError,
  milestoneProjectId,
  requireIssue,
} from "../server/issue-writes";
import {
  memberName,
  notifyIssueMentions,
  notifyMembers,
  subscribeToIssue,
} from "../server/notifications";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description:
    "Create an issue on a team. The identifier (e.g. ENG-142) is allocated automatically. Pass parentIssueId to create a sub-issue, which inherits the parent's team, project and cycle but never its assignee or priority. Pass templateId to start from a team template: anything you also pass explicitly wins over the template's default. Resolve team/status/assignee/label/template ids with get-workspace and list-issue-templates first.",
  schema: z.object({
    teamId: z.string().optional().describe("Team id"),
    teamKey: z.string().optional().describe("Team key such as ENG"),
    title: z.string().min(1).describe("Issue title"),
    description: z.string().optional(),
    statusId: z
      .string()
      .optional()
      .describe("Workflow status id; defaults to the team's first unstarted status"),
    // Optional rather than defaulted, so "the caller said none" stays
    // distinguishable from "the caller said nothing" when a template applies.
    priority: prioritySchema.optional(),
    assigneeId: z
      .string()
      .optional()
      .describe("Member id; humans and agents are both assignable"),
    projectId: z.string().optional(),
    cycleId: z.string().optional(),
    milestoneId: z.string().optional(),
    parentIssueId: z
      .string()
      .optional()
      .describe("Parent issue id or identifier; creates a sub-issue"),
    estimate: z.coerce.number().int().optional(),
    dueDate: z.string().optional().describe("ISO date"),
    labelIds: z.array(z.string()).optional(),
    triage: z
      .boolean()
      .optional()
      .describe(
        "File this into the team's triage queue for review. Ignored when the team has triage turned off, in which case the issue is created normally.",
      ),
    source: z
      .string()
      .optional()
      .describe("Where the issue came from: manual, agent, api, integration name"),
    templateId: z
      .string()
      .optional()
      .describe(
        "Issue template to start from. Explicit arguments override the template; the template supplies the rest.",
      ),
    recurringDefinitionId: z
      .string()
      .optional()
      .describe(
        "Set by the recurring-issue processor to record which rule generated this issue. Not for general use.",
      ),
  }),
  run: async (rawArgs) => {
    const parent = rawArgs.parentIssueId
      ? await requireIssue(rawArgs.parentIssueId)
      : null;

    const template = rawArgs.templateId
      ? await requireTemplate(rawArgs.templateId)
      : null;

    // Only for naming the rule in the activity entry; the column is set from
    // the argument either way.
    const [recurrence] = rawArgs.recurringDefinitionId
      ? await db
          .select({
            id: recurringIssueDefinitions.id,
            name: recurringIssueDefinitions.name,
          })
          .from(recurringIssueDefinitions)
          .where(eq(recurringIssueDefinitions.id, rawArgs.recurringDefinitionId))
          .limit(1)
      : [];

    if (!rawArgs.teamId && !rawArgs.teamKey && !parent && !template) {
      throw new Error("Either teamId or teamKey is required.");
    }

    const [team] = await db
      .select()
      .from(teams)
      .where(
        rawArgs.teamId
          ? eq(teams.id, rawArgs.teamId)
          : rawArgs.teamKey
            ? eq(teams.key, rawArgs.teamKey.toUpperCase())
            : parent
              ? eq(teams.id, parent.teamId)
              : eq(teams.id, template!.teamId),
      )
      .limit(1);
    if (!team) throw new Error("Team not found.");

    if (template && template.teamId !== team.id) {
      throw new UserError("That template belongs to a different team.");
    }

    /**
     * Template defaults fill only what the caller left out, and the result is
     * validated below exactly like a hand-written call: a template whose
     * status was deleted loses that field rather than smuggling it past the
     * checks. Humans and agents share this merge.
     */
    const merged = applyTemplate(
      rawArgs,
      template ? await templateDefaults(template) : null,
    );
    const args = {
      ...rawArgs,
      title: merged.title ?? rawArgs.title,
      description: merged.description ?? undefined,
      statusId: merged.statusId ?? undefined,
      priority: merged.priority as typeof rawArgs.priority,
      assigneeId: merged.assigneeId ?? undefined,
      projectId: merged.projectId ?? undefined,
      cycleId: merged.cycleId ?? undefined,
      milestoneId: merged.milestoneId ?? undefined,
      estimate: merged.estimate ?? undefined,
      dueDate: merged.dueDate ?? undefined,
      labelIds: merged.labelIds,
    };

    const teamStatuses = await db
      .select()
      .from(workflowStatuses)
      .where(eq(workflowStatuses.teamId, team.id))
      .orderBy(asc(workflowStatuses.position));
    if (teamStatuses.length === 0) {
      throw new Error("Team has no workflow statuses.");
    }

    const defaultStatus =
      teamStatuses.find((status) => status.category === "unstarted") ??
      teamStatuses[0];
    const statusId = args.statusId ?? defaultStatus.id;

    let projectId = args.projectId ?? null;
    let cycleId = args.cycleId ?? null;
    if (parent && parent.teamId === team.id) {
      if (args.projectId === undefined) projectId = parent.projectId;
      if (args.cycleId === undefined) cycleId = parent.cycleId;
    }

    if (cycleId) {
      const [cycle] = await db
        .select({ teamId: cycles.teamId })
        .from(cycles)
        .where(eq(cycles.id, cycleId))
        .limit(1);
      const wrongTeam = !cycle || cycle.teamId !== team.id;
      // An explicit cycle is a mistake worth reporting; one merely inherited
      // from a parent on another team is simply dropped.
      if (wrongTeam && args.cycleId) {
        throw new UserError("That cycle belongs to a different team.");
      }
      if (wrongTeam) cycleId = null;
    }

    if (args.milestoneId) {
      const owner = await milestoneProjectId(args.milestoneId);
      if (!owner) throw new UserError("Milestone not found.");
      if (owner !== projectId) {
        throw new UserError(
          "That milestone belongs to a different project than the issue.",
        );
      }
    }

    // neon-http has no multi-statement transactions, so the counter bump is a
    // single atomic UPDATE ... RETURNING.
    const [counter] = await db
      .update(teams)
      .set({ nextIssueNumber: sql`${teams.nextIssueNumber} + 1` })
      .where(eq(teams.id, team.id))
      .returning({ nextIssueNumber: teams.nextIssueNumber });
    const identifierNumber = counter.nextIssueNumber - 1;

    const actorId = await getCurrentMemberId();
    const intoTriage = Boolean(args.triage) && team.triageEnabled;

    const [created] = await db
      .insert(issues)
      .values({
        teamId: team.id,
        identifierNumber,
        title: args.title,
        description: args.description ?? null,
        statusId,
        priority: args.priority ?? "none",
        assigneeId: args.assigneeId ?? null,
        projectId,
        cycleId,
        milestoneId: args.milestoneId ?? null,
        parentIssueId: parent?.id ?? null,
        mentions: parseMentionIds(args.description),
        // Triage is opt-in per call and per team; normal creation is untouched.
        triageStatus: intoTriage ? ("pending" as const) : null,
        triageSource: intoTriage ? (args.source ?? "manual") : (args.source ?? null),
        estimate: args.estimate ?? null,
        dueDate: args.dueDate ? new Date(args.dueDate) : null,
        recurringDefinitionId: args.recurringDefinitionId ?? null,
        createdBy: actorId,
        sortOrder: Date.now(),
      })
      .returning();

    if (cycleId) {
      // Starts this issue's cycle history. Recurring generation is called out
      // separately so scope-added can later be attributed to automation.
      await openMembership({
        issueId: created.id,
        teamId: team.id,
        cycleId,
        actorId,
        reason: args.recurringDefinitionId ? "recurring" : "created_in_cycle",
        at: created.createdAt,
      });
    }

    if (args.labelIds?.length) {
      await db.insert(issueLabels).values(
        args.labelIds.map((labelId) => ({
          issueId: created.id,
          labelId,
        })),
      );
    }

    await db.insert(activities).values({
      issueId: created.id,
      actorId,
      type: "created",
      // The template rides on the existing "created" entry rather than adding
      // an "applied template" row: it is provenance, not a second event.
      metadata: {
        field: "created",
        to: created.title,
        ...(template
          ? { templateId: template.id, templateName: template.name }
          : {}),
        ...(recurrence
          ? {
              source: "recurring_issue",
              recurringDefinitionId: recurrence.id,
              recurringDefinitionName: recurrence.name,
            }
          : {}),
      },
    });

    if (intoTriage) {
      await db.insert(activities).values({
        issueId: created.id,
        actorId,
        type: "triage_entered",
        metadata: { field: "triage", to: created.triageSource },
      });
    }

    const identifier = formatIdentifier(team.key, identifierNumber);
    const context = {
      issueId: created.id,
      identifier,
      title: created.title,
      actorId,
      actorName: await memberName(actorId),
    };

    // Creating an issue, and being assigned one, both mean you follow it.
    await subscribeToIssue(created.id, [actorId, created.assigneeId]);
    const mentioned = await notifyIssueMentions(context, created.mentions ?? []);
    await notifyMembers({
      recipientIds: [created.assigneeId],
      type: "issue_assigned",
      entityType: "issue",
      entityId: created.id,
      actorId,
      exclude: mentioned,
      metadata: {
        issueIdentifier: identifier,
        issueTitle: created.title,
        actorName: context.actorName,
      },
    });

    publishIssueChange({
      id: created.id,
      version: created.version,
      projectId: created.projectId,
      cycleId: created.cycleId,
      triage: created.triageStatus !== null,
    });

    return {
      id: created.id,
      identifier,
      title: created.title,
      teamKey: team.key,
      parentIssueId: created.parentIssueId,
      triageStatus: created.triageStatus,
    };
  },
});
