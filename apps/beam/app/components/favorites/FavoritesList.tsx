/**
 * Everything the current member has starred, in the order they starred it.
 *
 * Favorites are resolved against the workspace bootstrap the app already
 * loads, exactly like the sidebar does, so this page adds no new read model.
 * Issues are the one exception: they are not in the bootstrap, so the
 * favorited ids are handed to the ordinary issue query engine.
 */
import {
  IconChevronRight,
  IconLayoutList,
  IconProgressCheck,
  IconStar,
  IconStarFilled,
} from "@tabler/icons-react";
import { useMemo } from "react";
import { Link } from "react-router";

import {
  MemberAvatar,
  StatusIcon,
  formatShortDate,
} from "@/components/issues/primitives";
import {
  HealthDot,
  ProjectStatusIcon,
  type ProjectHealth,
  type ProjectStatus,
} from "@/components/projects/primitives";
import { FavoriteRowMenu } from "@/components/menus/FavoriteRowMenu";
import { Skeleton } from "@/components/ui/skeleton";
import { useFavoriteIssues, useFavorites } from "@/hooks/use-favorites";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

export function FavoritesList() {
  const { workspace } = useWorkspace();
  const { entries, unfavorite, pending } = useFavorites();

  const { issues, isLoading: issuesLoading } = useFavoriteIssues();

  if (!workspace) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-2/3" />
      </div>
    );
  }

  const sections = [
    {
      key: "issue",
      title: "Issues",
      rows: entries
        .filter((entry) => entry.entityType === "issue")
        .flatMap((entry) => {
          const issue = issues.find((row) => row.id === entry.entityId);
          if (!issue) return [];
          return [
            {
              id: entry.id,
              href: `/issue/${issue.identifier}`,
              icon: <StatusIcon status={issue.status} />,
              label: issue.title,
              lead: issue.identifier,
              meta: (
                <>
                  {issue.archivedAt ? (
                    <span className="beam-chip shrink-0">Archived</span>
                  ) : null}
                  {issue.dueDate ? (
                    <span className="beam-meta shrink-0">
                      {formatShortDate(issue.dueDate)}
                    </span>
                  ) : null}
                  <MemberAvatar member={issue.assignee} size={18} />
                </>
              ),
              onRemove: () => unfavorite("issue", entry.entityId),
            },
          ];
        }),
    },
    {
      key: "project",
      title: "Projects",
      rows: entries
        .filter((entry) => entry.entityType === "project")
        .flatMap((entry) => {
          const project = workspace.projects.find(
            (row) => row.id === entry.entityId,
          );
          if (!project) return [];
          return [
            {
              id: entry.id,
              href: `/projects/${project.id}`,
              icon: (
                <ProjectStatusIcon status={project.status as ProjectStatus} />
              ),
              label: project.name,
              lead: null,
              meta: (
                <>
                  {project.targetDate ? (
                    <span className="beam-meta shrink-0">
                      {formatShortDate(project.targetDate)}
                    </span>
                  ) : null}
                  <HealthDot health={project.health as ProjectHealth} />
                </>
              ),
              onRemove: () => unfavorite("project", entry.entityId),
            },
          ];
        }),
    },
    {
      key: "view",
      title: "Views",
      rows: entries
        .filter((entry) => entry.entityType === "view")
        .flatMap((entry) => {
          const view = workspace.views.find((row) => row.id === entry.entityId);
          if (!view) return [];
          const team = workspace.teams.find((row) => row.id === view.teamId);
          return [
            {
              id: entry.id,
              href: `/views/${view.id}`,
              icon: (
                <IconLayoutList className="size-3.5 text-muted-foreground" />
              ),
              label: view.name,
              lead: null,
              meta: (
                <span className="beam-meta shrink-0">
                  {team ? team.name : "All teams"}
                </span>
              ),
              onRemove: () => unfavorite("view", entry.entityId),
            },
          ];
        }),
    },
    {
      key: "cycle",
      title: "Cycles",
      rows: entries
        .filter((entry) => entry.entityType === "cycle")
        .flatMap((entry) => {
          const team = workspace.teams.find((row) =>
            row.cycles.some((cycle) => cycle.id === entry.entityId),
          );
          const cycle = team?.cycles.find((row) => row.id === entry.entityId);
          if (!team || !cycle) return [];
          return [
            {
              id: entry.id,
              href: `/team/${team.key.toUpperCase()}/cycles/${cycle.id}`,
              icon: (
                <IconProgressCheck className="size-3.5 text-muted-foreground" />
              ),
              label: cycle.name ?? `Cycle ${cycle.number}`,
              lead: team.key.toUpperCase(),
              meta: (
                <span className="beam-meta shrink-0">
                  {formatShortDate(cycle.startsAt)} –{" "}
                  {formatShortDate(cycle.endsAt)}
                </span>
              ),
              onRemove: () => unfavorite("cycle", entry.entityId),
            },
          ];
        }),
    },
    {
      key: "team",
      title: "Teams",
      rows: entries
        .filter((entry) => entry.entityType === "team")
        .flatMap((entry) => {
          const team = workspace.teams.find((row) => row.id === entry.entityId);
          if (!team) return [];
          return [
            {
              id: entry.id,
              href: `/team/${team.key.toUpperCase()}/issues`,
              icon: (
                <IconChevronRight className="size-3.5 text-muted-foreground" />
              ),
              label: team.name,
              lead: team.key.toUpperCase(),
              meta: null,
              onRemove: () => unfavorite("team", entry.entityId),
            },
          ];
        }),
    },
  ].filter((section) => section.rows.length > 0);

  if (sections.length === 0 && !issuesLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 p-8 text-center">
        <IconStar className="size-5 text-muted-foreground" />
        <p className="text-[13px] font-medium">No favorites yet</p>
        <p className="beam-meta max-w-xs">
          Star an issue, project, view or cycle and it will show up here and in
          the sidebar for quick access.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {sections.map((section) => (
        <section key={section.key}>
          <h2 className="beam-meta sticky top-0 z-10 border-b border-border bg-background/95 px-4 py-1 backdrop-blur">
            {section.title}
          </h2>
          <ul>
            {section.rows.map((row) => (
              <li key={row.id}>
                <FavoriteRowMenu
                  href={row.href}
                  label={row.label}
                  onRemove={row.onRemove}
                >
                <Link
                  to={row.href}
                  className="group flex h-9 items-center gap-2 border-b border-border/70 px-4 text-[13px] transition-colors hover:bg-muted/60"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {row.icon}
                  </span>
                  {row.lead ? (
                    <span className="beam-meta w-[64px] shrink-0">
                      {row.lead}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                    {row.label}
                  </span>
                  {row.meta}
                  <button
                    type="button"
                    aria-label={`Unfavorite ${row.label}`}
                    disabled={pending}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void row.onRemove();
                    }}
                    className={cn(
                      "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded",
                      "text-muted-foreground opacity-0 transition-opacity",
                      "hover:bg-accent hover:text-foreground group-hover:opacity-100",
                      "focus-visible:opacity-100 disabled:cursor-not-allowed",
                    )}
                  >
                    <IconStarFilled className="size-3.5" />
                  </button>
                </Link>
                </FavoriteRowMenu>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
