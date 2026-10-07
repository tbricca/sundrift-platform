/**
 * The template editor. Every default is picked with the same controls the
 * issue surfaces use, so a template is authored the way an issue is edited.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { MentionTextarea } from "@/components/issues/MentionTextarea";
import {
  IssueProperty,
  type PropertyContext,
  type PropertyId,
  type PropertyValue,
} from "@/components/issues/properties";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import type { Priority } from "@/lib/issue-query";
import { invalidateTemplates } from "@/lib/query-keys";

import type { TemplateSummary } from "./useTemplates";

const TEMPLATE_PROPERTIES: PropertyId[] = [
  "status",
  "priority",
  "assignee",
  "labels",
  "project",
  "milestone",
  "cycle",
  "estimate",
];

export type TemplateDraft = Partial<TemplateSummary> & { teamId: string };

/** Property values a template starts the editor with. */
function toValues(template: Partial<TemplateSummary>) {
  return {
    status: template.statusId ?? null,
    priority: template.priority ?? null,
    assignee: template.assigneeId ?? null,
    labels: template.labelIds ?? [],
    project: template.projectId ?? null,
    milestone: template.milestoneId ?? null,
    cycle: template.cycleId ?? null,
    estimate: template.estimate ?? null,
  } as Record<PropertyId, PropertyValue>;
}

export function TemplateDialog({
  draft,
  onClose,
}: {
  /** Existing template to edit, or a new one carrying just its team. */
  draft: TemplateDraft | null;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [titleTemplate, setTitleTemplate] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [dueOffset, setDueOffset] = useState("");
  const [values, setValues] = useState<Record<PropertyId, PropertyValue>>(
    toValues({}),
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setName(draft.name ?? "");
    setDescription(draft.description ?? "");
    setTitleTemplate(draft.titleTemplate ?? "");
    setIssueDescription(draft.issueDescription ?? "");
    setDueOffset(
      draft.dueDateOffsetDays != null ? String(draft.dueDateOffsetDays) : "",
    );
    setValues(toValues(draft));
  }, [draft]);

  if (!draft) return null;

  const team = workspace?.teams.find((entry) => entry.id === draft.teamId) ?? null;
  const ctx: PropertyContext = {
    workspace,
    team,
    projectId: (values.project as string | null) ?? null,
  };

  function setValue(property: PropertyId, value: PropertyValue) {
    setValues((current) => {
      const next = { ...current, [property]: value };
      // A milestone only belongs to one project, so changing the project
      // clears it — the same rule the server applies.
      if (property === "project") next.milestone = null;
      return next;
    });
  }

  async function submit() {
    if (!name.trim() || !draft) return;
    setPending(true);
    const offset = dueOffset.trim() === "" ? null : Number(dueOffset);

    const payload = {
      teamId: draft.teamId,
      name: name.trim(),
      description: description.trim() || null,
      titleTemplate: titleTemplate.trim() || null,
      issueDescription: issueDescription.trim() || null,
      statusId: (values.status as string | null) ?? null,
      priority: (values.priority as Priority | null) ?? null,
      assigneeId: (values.assignee as string | null) ?? null,
      projectId: (values.project as string | null) ?? null,
      milestoneId: (values.milestone as string | null) ?? null,
      cycleId: (values.cycle as string | null) ?? null,
      estimate: (values.estimate as number | null) ?? null,
      dueDateOffsetDays: Number.isFinite(offset) ? offset : null,
      labelIds: (values.labels as string[] | null) ?? [],
    };

    try {
      if (draft.id) {
        await callAction(
          "update-issue-template",
          { id: draft.id, ...payload },
          { method: "PUT" },
        );
      } else {
        await callAction("create-issue-template", payload);
      }
      invalidateTemplates(queryClient);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the template.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-xl gap-0 overflow-visible p-0">
        <DialogTitle className="sr-only">
          {draft.id ? "Edit template" : "New template"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Defaults applied when an issue is created from this template.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
          />
          <span className="beam-meta">{team?.key ?? "Team"}</span>
          <span className="text-[13px] font-medium">
            {draft.id ? "Edit template" : "New template"}
          </span>
        </div>

        <div className="flex flex-col gap-2 px-4 pb-2 pt-3">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Template name, e.g. Bug report"
            className="h-9 border-0 px-0 text-[15px] font-medium shadow-none focus-visible:ring-0"
          />
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="When should someone use this? (optional)"
            className="h-7 text-[13px]"
          />

          <div className="mt-2 flex flex-col gap-1.5 border-t border-border pt-3">
            <span className="beam-meta">Issue defaults</span>
            <Input
              value={titleTemplate}
              onChange={(event) => setTitleTemplate(event.target.value)}
              placeholder="Default title (optional)"
              className="h-7 text-[13px]"
            />
            <MentionTextarea
              value={issueDescription}
              onChange={setIssueDescription}
              members={workspace?.members ?? []}
              ariaLabel="Default issue description"
              placeholder="Default description… use @ to mention someone"
              className="min-h-[76px]"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2.5">
          {TEMPLATE_PROPERTIES.map((property) => (
            <IssueProperty
              key={property}
              property={property}
              value={values[property]}
              ctx={ctx}
              variant="inline"
              className="h-7 border border-border"
              onChange={(value) => setValue(property, value)}
            />
          ))}
          <label className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-[12px] text-muted-foreground">
            Due +
            <input
              value={dueOffset}
              onChange={(event) =>
                setDueOffset(event.target.value.replace(/[^0-9-]/g, ""))
              }
              placeholder="—"
              aria-label="Due date offset in days"
              className="w-8 bg-transparent text-center outline-none"
            />
            d
          </label>
        </div>

        <div className="flex items-center gap-2 border-t border-border px-3 py-2.5">
          <span className="beam-meta flex-1">
            Anything left empty stays empty when the issue is created.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!name.trim() || pending}
            className="inline-flex h-7 cursor-pointer items-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Saving…" : draft.id ? "Save template" : "Create template"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
