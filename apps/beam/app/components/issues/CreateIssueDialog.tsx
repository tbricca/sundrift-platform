import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { TemplatePicker } from "@/components/templates/TemplatePicker";
import {
  useTemplates,
  type TemplateSummary,
} from "@/components/templates/useTemplates";
import {
  SHORTCUT_PRIORITY,
  hasOpenPopover,
  useShortcuts,
} from "@/hooks/use-shortcuts";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import { useWorkspace } from "@/hooks/use-workspace";
import type { Priority } from "@/lib/issue-query";
import { cn } from "@/lib/utils";

import { MentionTextarea } from "./MentionTextarea";
import {
  IssueProperty,
  type PropertyContext,
  type PropertyValue,
} from "./properties";

export const CREATE_ISSUE_EVENT = "beam:create-issue";
const LAST_TEAM_KEY = "beam.lastTeamId";

export type CreateIssueOptions = { teamId?: string; templateId?: string };

/**
 * Opens quick-create. The optional template is only a starting point: the
 * dialog still opens immediately with the title focused, and every prefilled
 * value stays editable.
 */
export function openCreateIssue(options: CreateIssueOptions = {}) {
  window.dispatchEvent(new CustomEvent(CREATE_ISSUE_EVENT, { detail: options }));
}

const QUICK_PROPERTIES = ["status", "priority", "assignee", "project", "cycle"] as const;

export function CreateIssueDialog() {
  const [open, setOpen] = useState(false);
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const queryClient = useQueryClient();

  const [teamId, setTeamId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, PropertyValue>>({});
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [templateId, setTemplateId] = useState<string | null>(null);
  // A template chosen before the list has loaded, e.g. from the palette.
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  // Properties the author has chosen themselves. A template never overwrites
  // one of these, which is the whole of the precedence rule.
  const touched = useRef(new Set<string>());

  const teams = useMemo(() => workspace?.teams ?? [], [workspace]);

  // Team precedence: explicit pick → current route → last used this session.
  const routeTeam = params.teamKey
    ? teams.find(
        (entry) => entry.key.toUpperCase() === params.teamKey!.toUpperCase(),
      )
    : undefined;
  const rememberedTeam = teams.find(
    (entry) => entry.id === readLastTeamId() && !routeTeam,
  );
  const team =
    teams.find((entry) => entry.id === teamId) ??
    routeTeam ??
    rememberedTeam ??
    teams[0] ??
    null;

  const ctx: PropertyContext = useMemo(
    () => ({
      workspace,
      team: team ?? null,
      projectId: (values.project as string | null) ?? null,
    }),
    [workspace, team, values.project],
  );

  const defaultStatusId = useMemo(() => {
    const statuses = team?.statuses ?? [];
    return (
      statuses.find((status) => status.category === "unstarted")?.id ??
      statuses[0]?.id ??
      null
    );
  }, [team]);

  useEffect(() => {
    const openHandler = (event: Event) => {
      const detail = (event as CustomEvent<CreateIssueOptions>).detail ?? {};
      if (detail.teamId) setTeamId(detail.teamId);
      setPendingTemplateId(detail.templateId ?? null);
      setOpen(true);
    };
    window.addEventListener(CREATE_ISSUE_EVENT, openHandler);
    return () => window.removeEventListener(CREATE_ISSUE_EVENT, openHandler);
  }, []);

  useShortcuts(
    {
      [shortcutKeys("issue.create")]: () => {
        setOpen(true);
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.global, enabled: !open },
  );

  useShortcuts(
    {
      [shortcutKeys("edit.submit")]: () => {
        void submit();
        return true;
      },
      [shortcutKeys("nav.escape")]: () => {
        if (hasOpenPopover()) return false;
        setOpen(false);
        return true;
      },
    },
    {
      priority: SHORTCUT_PRIORITY.dialog,
      enabled: open,
      allowWhileTyping: true,
    },
  );

  // Reset when the modal closes so the next open starts clean.
  useEffect(() => {
    if (open) return;
    setTitle("");
    setDescription("");
    setValues({});
    setTeamId(null);
    setTemplateId(null);
    touched.current = new Set();
  }, [open]);

  useEffect(() => {
    if (open && defaultStatusId && values.status === undefined) {
      setValues((current) => ({ ...current, status: defaultStatusId }));
    }
  }, [open, defaultStatusId, values.status]);

  // Only this team's templates are offered, so a selection can never pull the
  // issue onto another team behind the author's back.
  const { templates } = useTemplates(open ? team?.id : undefined);
  const selectedTemplate =
    templates.find((entry) => entry.id === templateId) ?? null;

  useEffect(() => {
    if (!pendingTemplateId) return;
    const target = templates.find((entry) => entry.id === pendingTemplateId);
    if (!target) return;
    setPendingTemplateId(null);
    applySelectedTemplate(target);
    // applySelectedTemplate reads current form state, which is empty on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTemplateId, templates]);

  function setValue(property: string, value: PropertyValue) {
    touched.current.add(property);
    setValues((current) => ({ ...current, [property]: value }));
  }

  /**
   * Fills the form from a template, leaving anything the author already chose
   * exactly as it is.
   */
  function applySelectedTemplate(template: TemplateSummary) {
    setTemplateId(template.id);
    if (!title.trim() && template.titleTemplate) setTitle(template.titleTemplate);
    if (!description.trim() && template.issueDescription) {
      setDescription(template.issueDescription);
    }

    const fromTemplate: Record<string, PropertyValue> = {
      status: template.statusId,
      priority: template.priority,
      assignee: template.assigneeId,
      project: template.projectId,
      cycle: template.cycleId,
    };

    setValues((current) => {
      const next = { ...current };
      for (const [property, value] of Object.entries(fromTemplate)) {
        if (value != null && !touched.current.has(property)) next[property] = value;
      }
      return next;
    });
  }

  async function submit() {
    if (!team || !title.trim() || pending) return;
    setPending(true);
    try {
      const created = await callAction<{ identifier: string }>("create-issue", {
        teamId: team.id,
        title: title.trim(),
        description: description.trim() || undefined,
        statusId: (values.status as string) ?? defaultStatusId ?? undefined,
        priority: (values.priority as Priority) ?? "none",
        assigneeId: (values.assignee as string | null) ?? undefined,
        projectId: (values.project as string | null) ?? undefined,
        cycleId: (values.cycle as string | null) ?? undefined,
        // The dialog does not expose labels, estimate, milestone or a due
        // date, so the template supplies those server-side. Everything above
        // is explicit and wins over it.
        templateId: templateId ?? undefined,
      });

      writeLastTeamId(team.id);
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["action", "list-issues"] });

      // Land on the new issue as an overlay over whatever is already open.
      const search = new URLSearchParams(location.search);
      search.set("issue", created.identifier);
      const onIssueSurface = location.pathname.startsWith("/team/");
      navigate(
        onIssueSurface
          ? `${location.pathname}?${search}`
          : `/team/${team.key}/issues?issue=${created.identifier}`,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that issue.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 overflow-visible p-0">
        <DialogTitle className="sr-only">Create issue</DialogTitle>
        <DialogDescription className="sr-only">
          Create a new issue in the selected team.
        </DialogDescription>

        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          {teams.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => {
                setTeamId(entry.id);
                setValues((current) => {
                  const next: Record<string, PropertyValue> = {
                    ...current,
                    cycle: null,
                  };
                  delete next.status;
                  return next;
                });
              }}
              className={cn(
                "inline-flex h-6 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[12px] font-medium transition-colors",
                team?.id === entry.id
                  ? "border-border bg-accent text-accent-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent/60",
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: entry.color ?? "#8b8f9c" }}
              />
              {entry.key}
            </button>
          ))}

          {templates.length ? (
            <div className="ms-auto">
              <TemplatePicker
                templates={templates}
                selected={selectedTemplate}
                onSelect={applySelectedTemplate}
                onClear={() => setTemplateId(null)}
              />
            </div>
          ) : null}
        </div>

        <div className="px-4 pb-2 pt-3">
          <Input
            autoFocus
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Issue title"
            className="h-9 border-0 px-0 text-[15px] font-medium shadow-none focus-visible:ring-0"
          />
          <MentionTextarea
            value={description}
            onChange={setDescription}
            members={workspace?.members ?? []}
            ariaLabel="Issue description"
            placeholder="Add description… use @ to mention someone"
            className="min-h-[76px]"
            onSubmit={() => void submit()}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2.5">
          {QUICK_PROPERTIES.map((property) => (
            <IssueProperty
              key={property}
              property={property}
              value={
                values[property] !== undefined
                  ? values[property]
                  : property === "status"
                    ? defaultStatusId
                    : property === "priority"
                      ? "none"
                      : null
              }
              ctx={ctx}
              variant="inline"
              className="h-7 border border-border"
              onChange={(value) => setValue(property, value)}
            />
          ))}

          <div className="ms-auto flex items-center gap-2">
            <span className="beam-meta hidden sm:inline">⌘↵</span>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!title.trim() || pending}
              className="inline-flex h-7 cursor-pointer items-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Creating…" : "Create issue"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function readLastTeamId(): string | null {
  try {
    return localStorage.getItem(LAST_TEAM_KEY);
  } catch {
    return null;
  }
}

function writeLastTeamId(teamId: string) {
  try {
    localStorage.setItem(LAST_TEAM_KEY, teamId);
  } catch {}
}
