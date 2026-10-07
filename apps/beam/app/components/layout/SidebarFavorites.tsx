/**
 * Favorites are resolved against the workspace bootstrap the sidebar already
 * loads, so starring a saved view shows up here without another query.
 */
import { IconStar } from "@tabler/icons-react";
import { useMemo } from "react";
import { Link, useLocation } from "react-router";

import { FavoriteRowMenu } from "@/components/menus/FavoriteRowMenu";
import {
  useFavoriteIssues,
  useFavorites,
  type FavoriteEntityType,
} from "@/hooks/use-favorites";
import { useWorkspace } from "@/hooks/use-workspace";
import { cn } from "@/lib/utils";

type FavoriteLink = {
  key: string;
  label: string;
  href: string;
  entityType: FavoriteEntityType;
  entityId: string;
};

export function SidebarFavorites() {
  const location = useLocation();
  const { workspace } = useWorkspace();
  const { entries: favorites, unfavorite } = useFavorites();
  const { issues } = useFavoriteIssues();

  const entries = useMemo<FavoriteLink[]>(() => {
    if (!workspace) return [];
    return favorites.flatMap<FavoriteLink>((favorite) => {
      switch (favorite.entityType) {
        case "issue": {
          const issue = issues.find((entry) => entry.id === favorite.entityId);
          if (!issue) return [];
          return [
            {
              key: favorite.id,
              entityType: favorite.entityType,
              entityId: favorite.entityId,
              label: issue.identifier + " " + issue.title,
              href: "/issue/" + issue.identifier,
            },
          ];
        }
        case "cycle": {
          const team = workspace.teams.find((entry) =>
            entry.cycles.some((cycle) => cycle.id === favorite.entityId),
          );
          const cycle = team?.cycles.find(
            (entry) => entry.id === favorite.entityId,
          );
          if (!team || !cycle) return [];
          return [
            {
              key: favorite.id,
              entityType: favorite.entityType,
              entityId: favorite.entityId,
              label: cycle.name ?? "Cycle " + cycle.number,
              href: "/team/" + team.key.toUpperCase() + "/cycles/" + cycle.id,
            },
          ];
        }
        case "view": {
          const view = workspace.views.find(
            (entry) => entry.id === favorite.entityId,
          );
          if (!view) return [];
          return [
            {
              key: favorite.id,
              entityType: favorite.entityType,
              entityId: favorite.entityId,
              label: view.name,
              href: "/views/" + view.id,
            },
          ];
        }
        case "project": {
          const project = workspace.projects.find(
            (entry) => entry.id === favorite.entityId,
          );
          if (!project) return [];
          return [
            {
              key: favorite.id,
              entityType: favorite.entityType,
              entityId: favorite.entityId,
              label: project.name,
              href: "/projects/" + project.id,
            },
          ];
        }
        case "team": {
          const team = workspace.teams.find(
            (entry) => entry.id === favorite.entityId,
          );
          if (!team) return [];
          return [
            {
              key: favorite.id,
              entityType: favorite.entityType,
              entityId: favorite.entityId,
              label: team.name,
              href: "/team/" + team.key.toUpperCase() + "/issues",
            },
          ];
        }
        default:
          return [];
      }
    });
  }, [favorites, issues, workspace]);

  if (entries.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="px-3 pb-1 pt-1 text-[12px] font-medium text-sidebar-foreground/55">
        Favorites
      </p>
      {entries.map((entry) => {
        const active = location.pathname === entry.href;
        return (
          <FavoriteRowMenu
            key={entry.key}
            href={entry.href}
            label={entry.label}
            onRemove={() => unfavorite(entry.entityType, entry.entityId)}
          >
          <Link
            to={entry.href}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] transition-colors",
              active
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
            )}
          >
            <IconStar className="size-4 shrink-0 text-sidebar-foreground/60" />
            <span className="truncate">{entry.label}</span>
          </Link>
          </FavoriteRowMenu>
        );
      })}
    </div>
  );
}
