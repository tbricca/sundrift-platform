/**
 * The one favorites hook. Both the sidebar and `/favorites` read through it,
 * so a star removed in either place disappears from both immediately and the
 * ordering can never drift between the two surfaces.
 *
 * Favorites live in the workspace bootstrap, so unfavoriting patches that
 * cached payload optimistically and lets the refetch confirm it.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspace } from "@/hooks/use-workspace";
import { KEYS } from "@/lib/query-keys";
import type {
  IssueGroupResult,
  IssueListItem,
  WorkspaceBootstrap,
} from "@/lib/types";

export type FavoriteEntityType =
  "issue" | "project" | "team" | "view" | "cycle";

export function useFavorites() {
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const [pending, setPending] = useState(false);

  // Server order is the manual `sort_order`; keep it rather than re-sorting.
  const entries = useMemo(() => workspace?.favorites ?? [], [workspace]);

  const patch = useCallback(
    (apply: (current: WorkspaceBootstrap) => WorkspaceBootstrap) => {
      queryClient.setQueriesData<WorkspaceBootstrap | null>(
        { queryKey: KEYS.workspace },
        (current) => (current ? apply(current) : current),
      );
    },
    [queryClient],
  );

  const setFavorite = useCallback(
    async (
      entityType: FavoriteEntityType,
      entityId: string,
      favorite: boolean,
    ) => {
      const before = entries;
      if (!favorite) {
        patch((current) => ({
          ...current,
          favorites: current.favorites.filter(
            (entry) =>
              !(entry.entityType === entityType && entry.entityId === entityId),
          ),
        }));
      }

      setPending(true);
      try {
        await callAction(
          "update-favorite",
          { entityType, entityId, favorite },
          { method: "PUT" },
        );
        void queryClient.invalidateQueries({ queryKey: KEYS.workspace });
      } catch (error) {
        patch((current) => ({ ...current, favorites: before }));
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update that favorite.",
        );
      } finally {
        setPending(false);
      }
    },
    [entries, patch, queryClient],
  );

  const unfavorite = useCallback(
    (entityType: FavoriteEntityType, entityId: string) =>
      setFavorite(entityType, entityId, false),
    [setFavorite],
  );

  return { entries, setFavorite, unfavorite, pending };
}

/**
 * Favorited issues, resolved through the ordinary issue engine because issues
 * are the one favoritable entity the workspace bootstrap does not carry.
 *
 * The sidebar and the Favorites page both call this, and because the query key
 * is derived from the same id list they share a single request. Members with no
 * favorited issues never issue one at all.
 */
export function useFavoriteIssues(): {
  issues: IssueListItem[];
  isLoading: boolean;
} {
  const { entries } = useFavorites();

  const issueIds = useMemo(
    () =>
      entries
        .filter((entry) => entry.entityType === "issue")
        .map((entry) => entry.entityId),
    [entries],
  );

  const params = useMemo(
    () => ({
      query: {
        // Archived favorites still resolve: a starred issue should never
        // silently vanish just because someone archived it.
        filters: { issueId: issueIds, includeArchived: true },
        grouping: "none" as const,
        ordering: [{ field: "manual" as const, direction: "asc" as const }],
        layout: "list" as const,
        visibleColumns: [],
      },
    }),
    [issueIds],
  );

  const { data, isLoading } = useActionQuery<{ groups: IssueGroupResult[] }>(
    "list-issues",
    params,
    { enabled: issueIds.length > 0 },
  );

  return {
    issues: useMemo(
      () => data?.groups.flatMap((group) => group.issues) ?? [],
      [data],
    ),
    isLoading: issueIds.length > 0 && isLoading,
  };
}
