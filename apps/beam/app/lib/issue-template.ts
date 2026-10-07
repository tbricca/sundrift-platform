/**
 * One definition of what "applying a template" means, used by both the create
 * dialog and the `create-issue` action so a human and an agent get identical
 * results from the same template.
 *
 * Precedence, highest first:
 *   1. explicit input — what the user typed, or what the caller passed
 *   2. template defaults
 *   3. Beam's normal create defaults, which the action already applies
 *
 * "Explicit" means present, including an explicit null: clearing the assignee
 * and never touching it are different intentions, so a null suppresses the
 * template's value rather than falling through to it.
 */

export type TemplateDefaults = {
  titleTemplate?: string | null;
  issueDescription?: string | null;
  priority?: string | null;
  statusId?: string | null;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  milestoneId?: string | null;
  estimate?: number | null;
  dueDateOffsetDays?: number | null;
  labelIds?: string[];
};

export type IssueDraft = {
  title?: string;
  description?: string;
  priority?: string;
  statusId?: string;
  assigneeId?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
  milestoneId?: string | null;
  estimate?: number | null;
  dueDate?: string | null;
  labelIds?: string[];
};

const explicit = <T>(value: T | undefined): value is T => value !== undefined;

/** Adds `days` to `from` and returns a plain ISO date. */
export function dueDateFromOffset(days: number, from: Date): string {
  const due = new Date(from.getTime());
  due.setUTCDate(due.getUTCDate() + days);
  return due.toISOString().slice(0, 10);
}

/**
 * Fills the gaps in `input` from `template`. Anything the caller stated is
 * returned untouched, so this is safe to run over a half-filled form.
 *
 * `now` is passed in rather than read here so a due-date offset resolves to a
 * concrete date at creation time and nothing dynamic reaches the issue row.
 */
export function applyTemplate(
  input: IssueDraft,
  template: TemplateDefaults | null | undefined,
  now: Date = new Date(),
): IssueDraft {
  if (!template) return input;

  const merged: IssueDraft = { ...input };

  // An empty title is treated as absent: the field starts empty in the form.
  if (!input.title?.trim() && template.titleTemplate) {
    merged.title = template.titleTemplate;
  }
  if (!input.description?.trim() && template.issueDescription) {
    merged.description = template.issueDescription;
  }
  if (!explicit(input.priority) && template.priority) {
    merged.priority = template.priority;
  }
  if (!explicit(input.statusId) && template.statusId) {
    merged.statusId = template.statusId;
  }
  if (!explicit(input.assigneeId) && template.assigneeId) {
    merged.assigneeId = template.assigneeId;
  }
  if (!explicit(input.projectId) && template.projectId) {
    merged.projectId = template.projectId;
  }
  if (!explicit(input.cycleId) && template.cycleId) {
    merged.cycleId = template.cycleId;
  }
  // A milestone only means anything inside its own project. If the caller
  // sent the issue somewhere else, the template's milestone is not a stale
  // reference to report — it is simply not applicable, and carrying it would
  // fail the create over a default nobody chose.
  if (
    !explicit(input.milestoneId) &&
    template.milestoneId &&
    merged.projectId === template.projectId
  ) {
    merged.milestoneId = template.milestoneId;
  }
  if (!explicit(input.estimate) && template.estimate != null) {
    merged.estimate = template.estimate;
  }
  if (!explicit(input.dueDate) && template.dueDateOffsetDays != null) {
    merged.dueDate = dueDateFromOffset(template.dueDateOffsetDays, now);
  }
  if (!explicit(input.labelIds) && template.labelIds?.length) {
    merged.labelIds = [...template.labelIds];
  }

  return merged;
}

/** "Status, Priority, 2 labels" — the settings list's one-line summary. */
export function templateSummary(template: TemplateDefaults): string[] {
  const parts: string[] = [];
  if (template.titleTemplate) parts.push("Title");
  if (template.issueDescription) parts.push("Description");
  if (template.statusId) parts.push("Status");
  if (template.priority) parts.push("Priority");
  if (template.assigneeId) parts.push("Assignee");
  if (template.projectId) parts.push("Project");
  if (template.cycleId) parts.push("Cycle");
  if (template.milestoneId) parts.push("Milestone");
  if (template.estimate != null) parts.push("Estimate");
  if (template.dueDateOffsetDays != null) {
    parts.push(`Due +${template.dueDateOffsetDays}d`);
  }
  const labels = template.labelIds?.length ?? 0;
  if (labels) parts.push(labels === 1 ? "1 label" : `${labels} labels`);
  return parts;
}
