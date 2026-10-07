/**
 * The team's templates. Deliberately a plain list rather than a gallery: a
 * template is a habit a team already knows the name of, so what matters is
 * finding it quickly and seeing what it will fill in.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { IconDots, IconPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { invalidateTemplates } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import { TemplateDialog, type TemplateDraft } from "./TemplateDialog";
import { useTemplates, type TemplateSummary } from "./useTemplates";

export function TemplateList({ teamId }: { teamId: string | undefined }) {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<TemplateDraft | null>(null);

  const { templates, isLoading } = useTemplates(teamId, {
    includeArchived: showArchived,
  });

  const query = search.trim().toLowerCase();
  const visible = query
    ? templates.filter((template) =>
        `${template.name} ${template.description ?? ""}`
          .toLowerCase()
          .includes(query),
      )
    : templates;

  const refresh = () => invalidateTemplates(queryClient);

  async function setArchived(template: TemplateSummary, archived: boolean) {
    await callAction(
      "update-issue-template",
      { id: template.id, archived },
      { method: "PUT" },
    );
    refresh();
  }

  async function duplicate(template: TemplateSummary) {
    try {
      // Duplication is an ordinary create with the same values, so there is no
      // second write path that could drift from the first.
      await callAction("create-issue-template", {
        teamId: template.teamId,
        name: `Copy of ${template.name}`,
        description: template.description,
        titleTemplate: template.titleTemplate,
        issueDescription: template.issueDescription,
        priority: template.priority,
        statusId: template.statusId,
        assigneeId: template.assigneeId,
        projectId: template.projectId,
        milestoneId: template.milestoneId,
        cycleId: template.cycleId,
        estimate: template.estimate,
        dueDateOffsetDays: template.dueDateOffsetDays,
        labelIds: template.labelIds,
      });
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate that.",
      );
    }
  }

  async function remove(template: TemplateSummary) {
    await callAction(
      "delete-issue-template",
      { id: template.id },
      { method: "DELETE" },
    );
    refresh();
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search templates…"
          className="h-7 max-w-56 text-[13px]"
        />
        <button
          type="button"
          onClick={() => setShowArchived((current) => !current)}
          className={cn(
            "h-7 cursor-pointer rounded-md px-2 text-[12px] transition-colors",
            showArchived
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          Archived
        </button>
        <button
          type="button"
          disabled={!teamId}
          onClick={() => teamId && setDraft({ teamId })}
          className="ms-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <IconPlus className="size-3.5" />
          New template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? null : visible.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted-foreground">
            {query
              ? "No templates match that search."
              : "No templates yet. Create one to prefill the issues this team files most often."}
          </p>
        ) : (
          visible.map((template) => (
            <div
              key={template.id}
              className="group/template flex items-center gap-3 border-b border-border px-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13px] font-medium">
                    {template.name}
                  </span>
                  {template.archivedAt ? (
                    <span className="beam-meta rounded bg-muted px-1">
                      Archived
                    </span>
                  ) : null}
                </div>
                {template.description ? (
                  <p className="truncate text-[12px] text-muted-foreground">
                    {template.description}
                  </p>
                ) : null}
                <p className="beam-meta mt-0.5 truncate">
                  {template.summary.length
                    ? template.summary.join(" · ")
                    : "No defaults"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setDraft(template)}
                className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/template:opacity-100"
              >
                Edit
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                  <IconDots className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem
                    className="text-[13px]"
                    onSelect={() => void duplicate(template)}
                  >
                    Duplicate
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-[13px]"
                    onSelect={() =>
                      void setArchived(template, !template.archivedAt)
                    }
                  >
                    {template.archivedAt ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-[13px] text-destructive focus:text-destructive"
                    onSelect={() => void remove(template)}
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))
        )}
      </div>

      <TemplateDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
