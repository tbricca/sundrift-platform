/**
 * One saved-view row implementation for both `/views` and `/team/:key/views`.
 * The two pages differ only in which views they ask for and which team a new
 * view is scoped to.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconCopy,
  IconDots,
  IconLayoutColumns,
  IconLayoutList,
  IconPencil,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import { savedViewMenuModel } from "@/components/command/command-menu";
import { describeFilters } from "@/components/issues/FilterBar";
import { EntityContextMenu } from "@/components/menus/EntityContextMenu";
import { copyText } from "@/hooks/use-command-runner";
import type { PropertyContext } from "@/components/issues/properties";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useWorkspace } from "@/hooks/use-workspace";
import type { IssueQuery } from "@/lib/issue-query";
import { cn } from "@/lib/utils";

export type SavedViewSummary = {
  id: string;
  name: string;
  query: IssueQuery;
  teamId: string | null;
  teamKey: string | null;
  teamName: string | null;
  ownerId: string;
  ownerName: string;
  isShared: boolean;
  isOwn: boolean;
  isFavorite: boolean;
};

type ListResponse = { currentMemberId: string | null; views: SavedViewSummary[] };

export function useSavedViews(teamId?: string) {
  const params = useMemo(() => (teamId ? { teamId } : {}), [teamId]);
  const query = useActionQuery<ListResponse>("list-saved-views", params);
  return {
    views: query.data?.views ?? [],
    isLoading: query.isLoading,
  };
}

function SavedViewRow({
  view,
  ctx,
  onChanged,
}: {
  view: SavedViewSummary;
  ctx: PropertyContext;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(view.name);
  const [favorite, setFavorite] = useState(view.isFavorite);

  const LayoutIcon =
    view.query.layout === "board" ? IconLayoutColumns : IconLayoutList;
  const summary = describeFilters(view.query.filters, ctx);

  async function toggleFavorite() {
    const next = !favorite;
    setFavorite(next);
    try {
      await callAction(
        "update-favorite",
        { entityType: "view", entityId: view.id, favorite: next },
        { method: "PUT" },
      );
      onChanged();
    } catch {
      setFavorite(!next);
      toast.error("Could not update that favorite.");
    }
  }

  async function rename() {
    const trimmed = name.trim();
    setRenaming(false);
    if (!trimmed || trimmed === view.name) return;
    try {
      await callAction(
        "update-saved-view",
        { id: view.id, name: trimmed },
        { method: "PUT" },
      );
      onChanged();
    } catch (error) {
      setName(view.name);
      toast.error(
        error instanceof Error ? error.message : "Could not rename that view.",
      );
    }
  }

  async function duplicate() {
    try {
      await callAction(
        "create-saved-view",
        {
          name: `${view.name} copy`,
          query: view.query,
          teamId: view.teamId,
          isShared: view.isShared,
        },
        { method: "POST" },
      );
      onChanged();
      toast.success("View duplicated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate that view.",
      );
    }
  }

  async function remove() {
    try {
      await callAction("delete-saved-view", { id: view.id }, { method: "DELETE" });
      onChanged();
      toast(`Deleted “${view.name}”`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete that view.",
      );
    }
  }

  return (
    <EntityContextMenu
      sections={savedViewMenuModel(favorite, view.isOwn)}
      header={view.name}
      onSelect={(id) => {
        if (id === "open") navigate(`/views/${view.id}`);
        if (id === "favorite" || id === "unfavorite") void toggleFavorite();
        if (id === "copy-view-link") {
          void copyText(
            `${window.location.origin}/views/${view.id}`,
            "View link",
          );
        }
        if (id === "view-rename") setRenaming(true);
        if (id === "view-duplicate") void duplicate();
        if (id === "view-delete") void remove();
      }}
    >
      <div className="group flex h-11 items-center gap-3 border-b border-border/70 px-3 text-[13px] transition-colors hover:bg-muted/60">
        <LayoutIcon className="size-4 shrink-0 text-muted-foreground" />

      {renaming ? (
        <Input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void rename()}
          onKeyDown={(event) => {
            if (event.key === "Enter") void rename();
            if (event.key === "Escape") {
              setName(view.name);
              setRenaming(false);
            }
          }}
          className="h-7 max-w-[280px] text-[13px]"
        />
      ) : (
        <Link
          to={`/views/${view.id}`}
          className="min-w-0 truncate font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {view.name}
        </Link>
      )}

      {view.teamKey ? (
        <span className="beam-chip shrink-0">{view.teamKey}</span>
      ) : (
        <span className="beam-chip shrink-0">Workspace</span>
      )}

      {summary.length ? (
        <span className="beam-meta hidden min-w-0 truncate md:inline">
          {summary.join(" · ")}
        </span>
      ) : (
        <span className="beam-meta hidden md:inline">No filters</span>
      )}

      <span className="beam-meta ms-auto hidden shrink-0 lg:inline">
        {view.isShared ? view.ownerName : "Private"}
      </span>

      <button
        type="button"
        aria-label={favorite ? "Unfavorite view" : "Favorite view"}
        aria-pressed={favorite}
        onClick={() => void toggleFavorite()}
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

      {view.isOwn ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${view.name}`}
            className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <IconDots className="size-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => setRenaming(true)}
            >
              <IconPencil className="size-3.5" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px]"
              onSelect={() => void duplicate()}
            >
              <IconCopy className="size-3.5" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2 text-[13px] text-destructive"
              onSelect={() => void remove()}
            >
              <IconTrash className="size-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-6 shrink-0" />
      )}
      </div>
    </EntityContextMenu>
  );
}

export function SavedViewList({
  teamId,
  emptyMessage = "No saved views yet. Configure an issue view and choose Save view.",
}: {
  teamId?: string;
  emptyMessage?: string;
}) {
  const { workspace } = useWorkspace();
  const { views, isLoading } = useSavedViews(teamId);
  const queryClient = useQueryClient();

  const ctx: PropertyContext = useMemo(
    () => ({
      workspace,
      team: teamId
        ? (workspace?.teams.find((team) => team.id === teamId) ?? null)
        : null,
    }),
    [workspace, teamId],
  );

  const onChanged = () => {
    void queryClient.invalidateQueries({
      queryKey: ["action", "list-saved-views"],
    });
    void queryClient.invalidateQueries({ queryKey: ["action", "get-workspace"] });
  };

  const mine = views.filter((view) => view.isOwn);
  const shared = views.filter((view) => !view.isOwn);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (views.length === 0) {
    return (
      <p className="p-8 text-center text-[13px] text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {mine.length ? (
        <section>
          <h2 className="sticky top-0 z-10 flex h-8 items-center border-b border-border bg-muted/80 px-3 text-[12px] font-semibold backdrop-blur-sm">
            My views
          </h2>
          {mine.map((view) => (
            <SavedViewRow
              key={view.id}
              view={view}
              ctx={ctx}
              onChanged={onChanged}
            />
          ))}
        </section>
      ) : null}

      {shared.length ? (
        <section>
          <h2 className="sticky top-0 z-10 flex h-8 items-center border-b border-border bg-muted/80 px-3 text-[12px] font-semibold backdrop-blur-sm">
            Shared views
          </h2>
          {shared.map((view) => (
            <SavedViewRow
              key={view.id}
              view={view}
              ctx={ctx}
              onChanged={onChanged}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
