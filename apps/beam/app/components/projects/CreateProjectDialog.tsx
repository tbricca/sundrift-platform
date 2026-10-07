/**
 * Quick-create, deliberately not a wizard: name and summary plus the same
 * compact property pickers the rest of the app uses.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { MemberAvatar, PriorityIcon } from "@/components/issues/primitives";
import {
  PropertyOptionList,
  type PropertyOption,
} from "@/components/issues/properties";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import { useWorkspace } from "@/hooks/use-workspace";
import { PRIORITY_LABEL, PRIORITY_ORDER, type Priority } from "@/lib/issue-query";
import { cn } from "@/lib/utils";

import {
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  ProjectStatusIcon,
  formatProjectDate,
  type ProjectStatus,
} from "./primitives";

const CREATE_PROJECT_EVENT = "beam:create-project";

export function openCreateProject(teamId?: string) {
  window.dispatchEvent(
    new CustomEvent(CREATE_PROJECT_EVENT, { detail: { teamId } }),
  );
}

function PickerButton({
  label,
  children,
  content,
}: {
  label: string;
  children: React.ReactNode;
  content: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className="inline-flex h-7 max-w-[180px] cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[12px] transition-colors hover:bg-accent"
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        {content}
      </PopoverContent>
    </Popover>
  );
}

export function CreateProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [summary, setSummary] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("planned");
  const [priority, setPriority] = useState<Priority>("none");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [targetDate, setTargetDate] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent).detail as
        | { teamId?: string }
        | undefined;
      setName("");
      setSummary("");
      setStatus("planned");
      setPriority("none");
      setLeadId(null);
      setTargetDate(null);
      setTeamIds(detail?.teamId ? [detail.teamId] : []);
      setOpen(true);
    }
    window.addEventListener(CREATE_PROJECT_EVENT, handle);
    return () => window.removeEventListener(CREATE_PROJECT_EVENT, handle);
  }, []);

  async function submit() {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      const created = (await callAction(
        "create-project",
        {
          name: name.trim(),
          summary: summary.trim() || undefined,
          status,
          priority,
          leadId,
          targetDate,
          teamIds,
        },
        { method: "POST" },
      )) as { id: string };

      void queryClient.invalidateQueries({
        queryKey: ["action", "list-projects"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["action", "get-workspace"],
      });
      setOpen(false);
      navigate(`/projects/${created.id}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that project.",
      );
    } finally {
      setPending(false);
    }
  }

  useShortcuts(
    {
      [shortcutKeys("edit.submit")]: () => {
        void submit();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, enabled: open, allowWhileTyping: true },
  );

  const members = workspace?.members ?? [];
  const teams = workspace?.teams ?? [];
  const lead = members.find((member) => member.id === leadId) ?? null;

  const memberOptions: PropertyOption[] = [
    { value: null, label: "No lead", icon: <MemberAvatar member={null} size={18} /> },
    ...members.map((member) => ({
      value: member.id,
      label: member.name,
      group: member.kind === "agent" ? "Agents" : "People",
      keywords: member.kind,
      icon: <MemberAvatar member={member} size={18} />,
    })),
  ];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-[13px] font-semibold">
          New project
        </DialogTitle>
        <DialogDescription className="sr-only">
          Create a project with a name, summary and a few properties.
        </DialogDescription>

        <div className="flex flex-col gap-2 p-4">
          <Input
            autoFocus
            value={name}
            placeholder="Project name"
            onChange={(event) => setName(event.target.value)}
            className="h-9 border-0 px-0 text-[15px] font-medium shadow-none focus-visible:ring-0"
          />
          <textarea
            value={summary}
            placeholder="Short summary…"
            rows={2}
            onChange={(event) => setSummary(event.target.value)}
            className="resize-none bg-transparent text-[13px] leading-6 outline-none placeholder:text-muted-foreground"
          />

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PickerButton
              label="Status"
              content={
                <PropertyOptionList
                  label="status"
                  value={status}
                  options={PROJECT_STATUS_ORDER.map((entry) => ({
                    value: entry,
                    label: PROJECT_STATUS_LABEL[entry],
                    icon: <ProjectStatusIcon status={entry} />,
                  }))}
                  onPick={(value) => setStatus(value as ProjectStatus)}
                />
              }
            >
              <ProjectStatusIcon status={status} />
              {PROJECT_STATUS_LABEL[status]}
            </PickerButton>

            <PickerButton
              label="Priority"
              content={
                <PropertyOptionList
                  label="priority"
                  value={priority}
                  options={PRIORITY_ORDER.map((entry) => ({
                    value: entry,
                    label: PRIORITY_LABEL[entry],
                    icon: <PriorityIcon priority={entry} />,
                  }))}
                  onPick={(value) => setPriority(value as Priority)}
                />
              }
            >
              <PriorityIcon priority={priority} />
              {PRIORITY_LABEL[priority]}
            </PickerButton>

            <PickerButton
              label="Lead"
              content={
                <PropertyOptionList
                  label="lead"
                  value={leadId}
                  searchable
                  options={memberOptions}
                  onPick={(value) => setLeadId(value as string | null)}
                />
              }
            >
              <MemberAvatar member={lead} size={18} />
              <span className="truncate">{lead?.name ?? "Lead"}</span>
            </PickerButton>

            <PickerButton
              label="Teams"
              content={
                <PropertyOptionList
                  label="teams"
                  multi
                  value={teamIds}
                  options={teams.map((team) => ({
                    value: team.id,
                    label: team.name,
                    icon: (
                      <span
                        className="size-2.5 rounded-[3px]"
                        style={{ backgroundColor: team.color ?? "#8b8f9c" }}
                      />
                    ),
                  }))}
                  onPick={(value) => setTeamIds((value as string[]) ?? [])}
                />
              }
            >
              <span className="truncate">
                {teamIds.length
                  ? teams
                      .filter((team) => teamIds.includes(team.id))
                      .map((team) => team.key)
                      .join(", ")
                  : "Teams"}
              </span>
            </PickerButton>

            <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[12px] transition-colors hover:bg-accent">
              <span className={cn(!targetDate && "text-muted-foreground")}>
                {targetDate ? formatProjectDate(targetDate) : "Target date"}
              </span>
              <input
                type="date"
                className="w-0 opacity-0"
                onChange={(event) =>
                  setTargetDate(
                    event.target.value
                      ? new Date(`${event.target.value}T12:00:00`).toISOString()
                      : null,
                  )
                }
              />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <span className="beam-meta me-auto">
            <kbd className="rounded border border-border px-1">⌘</kbd>
            <kbd className="ms-0.5 rounded border border-border px-1">↵</kbd> to
            create
          </span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-7 cursor-pointer rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || pending}
            onClick={() => void submit()}
            className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create project
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
