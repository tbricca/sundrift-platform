/**
 * The project header lives on the parent route and the tabs render through an
 * Outlet, so Overview / Issues / Updates never duplicate it and switching tabs
 * never remounts the header.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { NavLink, useParams } from "react-router";
import { toast } from "sonner";

import { MemberAvatar, PriorityIcon } from "@/components/issues/primitives";
import {
  PropertyOptionList,
  type PropertyOption,
} from "@/components/issues/properties";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useWorkspace } from "@/hooks/use-workspace";
import { publishProjectContext } from "@/lib/agent-project-context";
import { PRIORITY_LABEL, PRIORITY_ORDER, type Priority } from "@/lib/issue-query";
import type { MemberRef } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProjectFavoriteButton } from "./ProjectList";
import {
  HealthLabel,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_ORDER,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  ProgressBar,
  ProjectStatusIcon,
  formatProjectDate,
  type ProjectHealth,
  type ProjectStatus,
  type Progress,
} from "./primitives";

export type ProjectMilestone = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  sortOrder: number;
  progress: Progress;
};

export type ProjectUpdate = {
  id: string;
  health: ProjectHealth;
  body: string;
  createdAt: string | null;
  updatedAt: string | null;
  isOwn: boolean;
  author: MemberRef | null;
};

export type ProjectDetail = {
  id: string;
  name: string;
  summary: string | null;
  description: string | null;
  status: ProjectStatus;
  priority: Priority;
  health: ProjectHealth;
  lead: MemberRef | null;
  startDate: string | null;
  targetDate: string | null;
  completedAt: string | null;
  isFavorite: boolean;
  progress: Progress;
  teams: { id: string; key: string; name: string; color: string | null }[];
  milestones: ProjectMilestone[];
  updates: ProjectUpdate[];
};

export function useProject(projectId: string) {
  const params = useMemo(() => ({ projectId }), [projectId]);
  const query = useActionQuery<ProjectDetail>("get-project", params);
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["action", "get-project"] });
    void queryClient.invalidateQueries({ queryKey: ["action", "list-projects"] });
  }, [queryClient]);

  const patch = useCallback(
    async (input: Record<string, unknown>) => {
      try {
        await callAction(
          "update-project",
          { projectId, ...input },
          { method: "PUT" },
        );
        refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Could not save that change.",
        );
        refresh();
      }
    },
    [projectId, refresh],
  );

  const project = query.data ?? null;

  useEffect(() => {
    if (!project) return;
    publishProjectContext({
      id: project.id,
      name: project.name,
      status: project.status,
      health: project.health,
      lead: project.lead?.name ?? null,
      startDate: project.startDate,
      targetDate: project.targetDate,
      progress: project.progress,
      milestones: project.milestones.map((milestone) => ({
        id: milestone.id,
        name: milestone.name,
      })),
    });
    return () => publishProjectContext(null);
  }, [project]);

  return { project, isLoading: query.isLoading, refresh, patch };
}

/** Inline property control: same popover + option list as the issue rail. */
export function ProjectProperty({
  label,
  value,
  options,
  searchable,
  multi,
  onPick,
  children,
  className,
}: {
  label: string;
  value: string | string[] | null;
  options: PropertyOption[];
  searchable?: boolean;
  multi?: boolean;
  onPick: (value: string | string[] | null) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          "inline-flex h-7 max-w-[220px] cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12px] outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-0">
        <PropertyOptionList
          label={label}
          value={value}
          options={options}
          multi={multi}
          searchable={searchable}
          onPick={(next) => onPick(next as string | string[] | null)}
        />
      </PopoverContent>
    </Popover>
  );
}

export function useMemberOptions(emptyLabel: string): PropertyOption[] {
  const { workspace } = useWorkspace();
  return useMemo(
    () => [
      {
        value: null,
        label: emptyLabel,
        icon: <MemberAvatar member={null} size={18} />,
      },
      // Humans and agents share the roster; the avatar carries the distinction.
      ...(workspace?.members ?? []).map((member) => ({
        value: member.id,
        label: member.name,
        group: member.kind === "agent" ? "Agents" : "People",
        keywords: member.kind,
        icon: <MemberAvatar member={member} size={18} />,
      })),
    ],
    [workspace, emptyLabel],
  );
}

const TABS = [
  { label: "Overview", to: "" },
  { label: "Issues", to: "issues" },
  { label: "Updates", to: "updates" },
];

export function ProjectHeader({
  project,
  patch,
  refresh,
}: {
  project: ProjectDetail;
  patch: (input: Record<string, unknown>) => Promise<void>;
  refresh: () => void;
}) {
  const { projectId = "" } = useParams();
  const { workspace } = useWorkspace();
  const memberOptions = useMemberOptions("No lead");
  const done = project.status === "completed" || project.status === "canceled";

  return (
    <header className="shrink-0 border-b border-border">
      <div className="flex h-11 items-center gap-2 px-4">
        <ProjectStatusIcon status={project.status} />
        <h1
          className={cn(
            "truncate text-[13px] font-semibold",
            project.status === "completed" && "line-through decoration-1",
          )}
        >
          {project.name}
        </h1>
        {done ? (
          <span className="beam-chip shrink-0">
            {PROJECT_STATUS_LABEL[project.status]}
          </span>
        ) : null}
        <ProgressBar progress={project.progress} className="ms-2 shrink-0" />
        <div className="ms-auto flex items-center gap-1">
          <ProjectFavoriteButton
            projectId={project.id}
            isFavorite={project.isFavorite}
            onChanged={refresh}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 px-3 pb-2">
        <ProjectProperty
          label="status"
          value={project.status}
          options={PROJECT_STATUS_ORDER.map((entry) => ({
            value: entry,
            label: PROJECT_STATUS_LABEL[entry],
            icon: <ProjectStatusIcon status={entry} />,
          }))}
          onPick={(value) => void patch({ status: value })}
        >
          <ProjectStatusIcon status={project.status} />
          {PROJECT_STATUS_LABEL[project.status]}
        </ProjectProperty>

        <ProjectProperty
          label="health"
          value={project.health}
          options={PROJECT_HEALTH_ORDER.map((entry) => ({
            value: entry,
            label: PROJECT_HEALTH_LABEL[entry],
          }))}
          onPick={(value) => void patch({ health: value })}
        >
          <HealthLabel health={project.health} />
        </ProjectProperty>

        <ProjectProperty
          label="priority"
          value={project.priority}
          options={PRIORITY_ORDER.map((entry) => ({
            value: entry,
            label: PRIORITY_LABEL[entry],
            icon: <PriorityIcon priority={entry} />,
          }))}
          onPick={(value) => void patch({ priority: value })}
        >
          <PriorityIcon priority={project.priority} />
          {PRIORITY_LABEL[project.priority]}
        </ProjectProperty>

        <ProjectProperty
          label="lead"
          value={project.lead?.id ?? null}
          options={memberOptions}
          searchable
          onPick={(value) => void patch({ leadId: value })}
        >
          <MemberAvatar member={project.lead} size={18} />
          <span className="truncate">{project.lead?.name ?? "No lead"}</span>
        </ProjectProperty>

        <ProjectProperty
          label="teams"
          multi
          value={project.teams.map((team) => team.id)}
          options={(workspace?.teams ?? []).map((team) => ({
            value: team.id,
            label: team.name,
            icon: (
              <span
                className="size-2.5 rounded-[3px]"
                style={{ backgroundColor: team.color ?? "#8b8f9c" }}
              />
            ),
          }))}
          onPick={(value) => void patch({ teamIds: value ?? [] })}
        >
          <span className="truncate">
            {project.teams.length
              ? project.teams.map((team) => team.key).join(", ")
              : "No teams"}
          </span>
        </ProjectProperty>

        <DateProperty
          label="Start"
          value={project.startDate}
          onChange={(value) => void patch({ startDate: value })}
        />
        <DateProperty
          label="Target"
          value={project.targetDate}
          onChange={(value) => void patch({ targetDate: value })}
        />
      </div>

      <nav className="flex items-center gap-1 px-3">
        {TABS.map((tab) => (
          <NavLink
            key={tab.label}
            to={
              tab.to ? `/projects/${projectId}/${tab.to}` : `/projects/${projectId}`
            }
            end={!tab.to}
            className={({ isActive }) =>
              cn(
                "-mb-px border-b-2 px-2 pb-1.5 pt-0.5 text-[12px] font-medium transition-colors",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
    </header>
  );
}

export function DateProperty({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[12px] transition-colors hover:bg-accent">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn(!value && "text-muted-foreground")}>
        {value ? formatProjectDate(value) : "—"}
      </span>
      <input
        type="date"
        value={value ? value.slice(0, 10) : ""}
        onChange={(event) =>
          onChange(
            event.target.value
              ? new Date(`${event.target.value}T12:00:00`).toISOString()
              : null,
          )
        }
        className="w-0 opacity-0"
      />
    </label>
  );
}
