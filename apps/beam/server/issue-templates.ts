/**
 * Template reads and the validation shared by every template write.
 *
 * A template holds real references, so it can go stale: the status it points
 * at can be deleted, the assignee can leave. Two rules keep that from turning
 * into a broken create flow —
 *
 *   writes  validate every reference against the template's team, so a
 *           template can never be *saved* pointing at another team's status;
 *   reads   drop references that no longer resolve, so applying an old
 *           template silently omits the missing field instead of failing.
 *
 * A dropped reference is never a bypass: whatever survives still goes through
 * `create-issue`'s own validation.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import type { TemplateDefaults } from "../app/lib/issue-template";
import {
  cycles,
  issueTemplateLabels,
  issueTemplates,
  labels,
  members,
  milestones,
  projects,
  workflowStatuses,
} from "../drizzle/schema";
import { db } from "./db";
import { UserError, milestoneProjectId } from "./issue-writes";

export type TemplateRow = typeof issueTemplates.$inferSelect;

/** The reference fields a template write may set. */
export type TemplateRefs = {
  statusId?: string | null;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  milestoneId?: string | null;
  labelIds?: string[];
};

export async function requireTemplate(id: string): Promise<TemplateRow> {
  const [row] = await db
    .select()
    .from(issueTemplates)
    .where(eq(issueTemplates.id, id))
    .limit(1);
  if (!row) throw new UserError(`Template not found: ${id}`, 404);
  return row;
}

/**
 * Rejects references that do not belong to `teamId`, mirroring the rules
 * `create-issue` applies. Checked at save time so the settings UI reports the
 * mistake while the author is still looking at the form.
 */
export async function validateTemplateRefs(
  teamId: string,
  refs: TemplateRefs,
  /** The project the template will end up pointing at, for the milestone check. */
  projectId: string | null,
): Promise<void> {
  if (refs.statusId) {
    const [status] = await db
      .select({ teamId: workflowStatuses.teamId })
      .from(workflowStatuses)
      .where(eq(workflowStatuses.id, refs.statusId))
      .limit(1);
    if (!status) throw new UserError("Status not found.");
    if (status.teamId !== teamId) {
      throw new UserError("That status belongs to a different team.");
    }
  }

  if (refs.cycleId) {
    const [cycle] = await db
      .select({ teamId: cycles.teamId })
      .from(cycles)
      .where(eq(cycles.id, refs.cycleId))
      .limit(1);
    if (!cycle) throw new UserError("Cycle not found.");
    if (cycle.teamId !== teamId) {
      throw new UserError("That cycle belongs to a different team.");
    }
  }

  if (refs.assigneeId) {
    const [member] = await db
      .select({ id: members.id })
      .from(members)
      .where(eq(members.id, refs.assigneeId))
      .limit(1);
    if (!member) throw new UserError("Assignee not found.");
  }

  if (refs.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, refs.projectId))
      .limit(1);
    if (!project) throw new UserError("Project not found.");
  }

  if (refs.milestoneId) {
    const owner = await milestoneProjectId(refs.milestoneId);
    if (!owner) throw new UserError("Milestone not found.");
    if (owner !== projectId) {
      throw new UserError(
        "That milestone belongs to a different project than the template.",
      );
    }
  }

  if (refs.labelIds?.length) {
    const found = await db
      .select({ id: labels.id })
      .from(labels)
      .where(inArray(labels.id, refs.labelIds));
    if (found.length !== new Set(refs.labelIds).size) {
      throw new UserError("One of those labels no longer exists.");
    }
  }
}

export async function templateLabelIds(templateId: string): Promise<string[]> {
  const rows = await db
    .select({ labelId: issueTemplateLabels.labelId })
    .from(issueTemplateLabels)
    .where(eq(issueTemplateLabels.templateId, templateId));
  return rows.map((row) => row.labelId);
}

/** Replaces a template's labels wholesale, the way issue labels are written. */
export async function setTemplateLabels(
  templateId: string,
  labelIds: string[],
): Promise<void> {
  await db
    .delete(issueTemplateLabels)
    .where(eq(issueTemplateLabels.templateId, templateId));
  if (labelIds.length === 0) return;
  await db
    .insert(issueTemplateLabels)
    .values(
      [...new Set(labelIds)].map((labelId) => ({ templateId, labelId })),
    );
}

/**
 * The defaults to merge into a create, with references that no longer resolve
 * left out. Milestones also drop when their project is not the one the issue
 * will land in, which is the same rule the issue write enforces.
 */
export async function templateDefaults(
  template: TemplateRow,
): Promise<TemplateDefaults> {
  const labelIds = await templateLabelIds(template.id);

  const [status, assignee, project, cycle, milestone] = await Promise.all([
    resolves(template.statusId, (id) =>
      db.select({ id: workflowStatuses.id }).from(workflowStatuses).where(eq(workflowStatuses.id, id)),
    ),
    resolves(template.assigneeId, (id) =>
      db.select({ id: members.id }).from(members).where(eq(members.id, id)),
    ),
    resolves(template.projectId, (id) =>
      db.select({ id: projects.id }).from(projects).where(eq(projects.id, id)),
    ),
    resolves(template.cycleId, (id) =>
      db.select({ id: cycles.id }).from(cycles).where(eq(cycles.id, id)),
    ),
    resolves(template.milestoneId, (id) =>
      db.select({ id: milestones.id }).from(milestones).where(eq(milestones.id, id)),
    ),
  ]);

  const projectId = project ? template.projectId : null;
  const milestoneOwner = milestone
    ? await milestoneProjectId(template.milestoneId!)
    : null;

  return {
    titleTemplate: template.titleTemplate,
    issueDescription: template.issueDescription,
    priority: template.priority,
    statusId: status ? template.statusId : null,
    assigneeId: assignee ? template.assigneeId : null,
    projectId,
    cycleId: cycle ? template.cycleId : null,
    milestoneId:
      milestone && milestoneOwner === projectId ? template.milestoneId : null,
    estimate: template.estimate,
    dueDateOffsetDays: template.dueDateOffsetDays,
    labelIds,
  };
}

/** Templates a team can pick from: its own, not archived, oldest name first. */
export async function listTeamTemplates(
  teamId: string,
): Promise<TemplateRow[]> {
  return await db
    .select()
    .from(issueTemplates)
    .where(
      and(
        eq(issueTemplates.teamId, teamId),
        isNull(issueTemplates.archivedAt),
      ),
    )
    .orderBy(asc(issueTemplates.name));
}

async function resolves(
  id: string | null,
  lookup: (id: string) => Promise<{ id: string }[]>,
): Promise<boolean> {
  if (!id) return false;
  return (await lookup(id)).length > 0;
}
