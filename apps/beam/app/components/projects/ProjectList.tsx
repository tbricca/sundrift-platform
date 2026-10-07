/**
 * One project row implementation for `/projects` and `/team/:key/projects`.
 * The two pages differ only in which projects they ask for and which team a
 * new project starts with.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconChevronDown,
  IconPlus,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { MemberAvatar } from "@/components/issues/primitives";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { PRIORITY_RANK, type Priority } from "@/lib/issue-query";
import type { MemberRef } from "@/lib/types";
import { cn } from "@/lib/utils";

import { ProjectRowMenu } from "@/components/menus/ProjectRowMenu";

import { openCreateProject } from "./CreateProjectDialog";
import {
  HealthDot,
  PROJECT_HEALTH_LABEL,
  PROJECT_STATUS_LABEL,
  ProgressBar,
  ProjectStatusIcon,
  formatProjectDate,
  isOverdue,
  type ProjectHealth,
  type ProjectStatus,
  type Progress,
} from "./primitives";

export type ProjectSummary = {
  id: string;
  name: string;
  summary: string | null;
  status: ProjectStatus;
  priority: Priority;
  health: ProjectHealth;
  lead: MemberRef | null;
  startDate: string | null;
  targetDate: string | null;
  updatedAt: string | null;
  teams: { id: string; key: string; name: string; color: string | null }[];
  progress: Progress;
  isFavorite: boolean;
};

type ListResponse = { projects: ProjectSummary[] };

const SORTS = {
  targetDate: "Target date",
  priority: "Priority",
  updatedAt: "Recently updated",
  name: "Name",
} as const;

type SortKey = keyof typeof SORTS;

export function useProjects(teamId?: string) {
  const params = useMemo(() => (teamId ? { teamId } : {}), [teamId]);
  const query = useActionQuery<ListResponse>("list-projects", params);
  return { projects: query.data?.projects ?? [], isLoading: query.isLoading };
}

function sortProjects(projects: ProjectSummary[], sort: SortKey) {
  const copy = [...projects];
  switch (sort) {
    case "priority":
      return copy.sort(
        (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
      );
    case "updatedAt":
      return copy.sort(
        (a, b) =>
          new Date(b.updatedAt ?? 0).getTime() -
          new Date(a.updatedAt ?? 0).getTime(),
      );
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "targetDate":
    default:
      return copy.sort((a, b) => {
        if (!a.targetDate) return 1;
        if (!b.targetDate) return -1;
        return (
          new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
        );
      });
  }
}

export function ProjectFavoriteButton({
  projectId,
  isFavorite,
  onChanged,
}: {
  projectId: string;
  isFavorite: boolean;
  onChanged: () => void;
}) {
  const [favorite, setFavorite] = useState(isFavorite);

  async function toggle() {
    const next = !favorite;
    setFavorite(next);
    try {
      await callAction(
        "update-favorite",
        { entityType: "project", entityId: projectId, favorite: next },
        { method: "PUT" },
      );
      onChanged();
    } catch {
      setFavorite(!next);
      toast.error("Could not update that favorite.");
    }
  }

  return (
    <button
      type="button"
      aria-label={favorite ? "Unfavorite project" : "Favorite project"}
      aria-pressed={favorite}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void toggle();
      }}
      className={cn(
        "inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded transition-colors hover:bg-accent",
        favorite ? "text-primary" : "text-muted-foreground",
      )}
    >
      {favorite ? (
        <IconStarFilled className="size-3.5" />
      ) : (
        <IconStar className="size-3.5" />
      )}
    </button>
  );
}

function ProjectRow({
  project,
  onChanged,
}: {
  project: ProjectSummary;
  onChanged: () => void;
}) {
  const done = project.status === "completed" || project.status === "canceled";
  const overdue = isOverdue(project.targetDate, done);

  return (
    <ProjectRowMenu project={project} onChanged={onChanged}>
    <Link
      to={`/projects/${project.id}`}
      className={cn(
        "group flex h-11 items-center gap-3 border-b border-border/70 px-3 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
        done && "opacity-70",
      )}
    >
      <ProjectStatusIcon status={project.status} />

      <span
        className={cn(
          "min-w-0 max-w-[280px] truncate font-medium text-foreground",
          project.status === "completed" && "line-through decoration-1",
        )}
      >
        {project.name}
      </span>

      {project.summary ? (
        <span className="beam-meta hidden min-w-0 flex-1 truncate lg:inline">
          {project.summary}
        </span>
      ) : (
        <span className="hidden flex-1 lg:inline" />
      )}

      <span className="beam-chip hidden shrink-0 md:inline-flex">
        {PROJECT_STATUS_LABEL[project.status]}
      </span>

      <span className="hidden shrink-0 items-center gap-1.5 md:flex">
        <HealthDot health={project.health} />
        <span className="beam-meta">{PROJECT_HEALTH_LABEL[project.health]}</span>
      </span>

      <div className="hidden shrink-0 items-center gap-1 xl:flex">
        {project.teams.slice(0, 3).map((team) => (
          <span
            key={team.id}
            title={team.name}
            className="beam-chip"
            style={{ borderColor: team.color ?? undefined }}
          >
            {team.key}
          </span>
        ))}
      </div>

      <ProgressBar progress={project.progress} className="hidden shrink-0 sm:flex" />

      <span
        className={cn(
          "beam-meta hidden w-[92px] shrink-0 text-right md:inline",
          overdue && "text-destructive",
        )}
      >
        {formatProjectDate(project.targetDate)}
      </span>

      <MemberAvatar member={project.lead} size={20} />

      <ProjectFavoriteButton
        projectId={project.id}
        isFavorite={project.isFavorite}
        onChanged={onChanged}
      />
    </Link>
    </ProjectRowMenu>
  );
}

export function ProjectList({
  teamId,
  emptyMessage = "No projects yet.",
}: {
  teamId?: string;
  emptyMessage?: string;
}) {
  const { projects, isLoading } = useProjects(teamId);
  const [sort, setSort] = useState<SortKey>("targetDate");
  const [hideDone, setHideDone] = useState(false);
  const queryClient = useQueryClient();

  const onChanged = () => {
    void queryClient.invalidateQueries({ queryKey: ["action", "list-projects"] });
    void queryClient.invalidateQueries({ queryKey: ["action", "get-workspace"] });
  };

  const visible = useMemo(() => {
    const filtered = hideDone
      ? projects.filter(
          (project) =>
            project.status !== "completed" && project.status !== "canceled",
        )
      : projects;
    return sortProjects(filtered, sort);
  }, [projects, sort, hideDone]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <span className="beam-meta mr-1">
          {visible.length} {visible.length === 1 ? "project" : "projects"}
        </span>

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
            {SORTS[sort]}
            <IconChevronDown className="size-3 opacity-60" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            <DropdownMenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
            >
              {(Object.keys(SORTS) as SortKey[]).map((key) => (
                <DropdownMenuRadioItem
                  key={key}
                  value={key}
                  className="text-[13px]"
                >
                  {SORTS[key]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          aria-pressed={hideDone}
          onClick={() => setHideDone((current) => !current)}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-accent",
            hideDone ? "text-primary" : "text-muted-foreground",
          )}
        >
          Hide completed
        </button>

        <button
          type="button"
          onClick={() => openCreateProject(teamId)}
          className="ms-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[12px] font-medium transition-colors hover:bg-accent"
        >
          <IconPlus className="size-3.5" />
          New project
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-md" />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <p className="p-8 text-center text-[13px] text-muted-foreground">
          {emptyMessage}
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
