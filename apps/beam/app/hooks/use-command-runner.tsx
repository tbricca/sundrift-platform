/**
 * One implementation of "run this command", used by the command palette, every
 * right-click menu and the issue detail menu.
 *
 * The point is that a menu is a *presentation* of the command catalog, not a
 * second copy of it: archiving from a context menu and archiving from the
 * palette must produce the same optimistic patch, the same toast, the same
 * Undo and the same server call, because they are the same call.
 *
 * Everything here delegates to the existing hooks - `useBulkMutations`,
 * `useFavorites`, the create dialogs - rather than talking to actions itself.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import type { MenuActionId } from "@/components/command/command-menu";
import { openCreateCycle } from "@/components/cycles/CreateCycleDialog";
import { openCreateIssue } from "@/components/issues/CreateIssueDialog";
import { useIssueSelectionOptional } from "@/components/issues/selection";
import type {
  PropertyContext,
  PropertyId,
  PropertyOption,
} from "@/components/issues/properties";
import { openCreateProject } from "@/components/projects/CreateProjectDialog";
import { openShortcutHelp } from "@/components/shortcuts/ShortcutHelp";
import { openGlobalSearch } from "@/components/search/GlobalSearch";
import { useBulkMutations } from "@/hooks/use-bulk-mutations";
import { useFavorites, type FavoriteEntityType } from "@/hooks/use-favorites";
import { useNotificationMutations } from "@/hooks/use-notifications";
import type { IssueListItem } from "@/lib/types";
import { invalidateWorkspace } from "@/lib/query-keys";

/** What a command acts on. Menus fill in the entity they were opened from. */
export type CommandTarget = {
  /** Issues the command applies to; empty for entity commands. */
  issues?: IssueListItem[];
  ctx: PropertyContext;
  /** Path used by the copy-link commands and by Open. */
  path?: string;
  /** Entity behind a favorite toggle. */
  favorite?: { type: FavoriteEntityType; id: string };
  /** Team used by create commands. */
  teamId?: string | null;
  teamKey?: string | null;
  projectId?: string | null;
  cycleId?: string | null;
};

export async function copyText(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast.error("Could not copy to the clipboard.");
  }
}

export function useCommandRunner() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const selection = useIssueSelectionOptional();
  const { setFavorite } = useFavorites();
  const { markAllRead } = useNotificationMutations();
  const {
    bulkProperty,
    bulkLabel,
    bulkCycleTarget,
    bulkRemove,
    bulkUnarchive,
  } = useBulkMutations();

  /**
   * Property edits go through the bulk path for one issue as well as many:
   * it already carries the optimistic patch, the regrouping and the Undo, and
   * a one-element selection is not a special case.
   */
  const applyProperty = useCallback(
    (target: CommandTarget, id: PropertyId, option: PropertyOption) => {
      const issues = target.issues ?? [];
      if (issues.length === 0) return;
      if (id === "labels") {
        // Labels add rather than replace, so an issue keeps its other tags.
        void bulkLabel(issues, option.value as string, "add", target.ctx);
      } else {
        void bulkProperty(issues, id, option.value, target.ctx);
      }
    },
    [bulkLabel, bulkProperty],
  );

  /** Returns false for ids this runner does not own, so a caller can extend. */
  const runCommand = useCallback(
    (id: MenuActionId, target: CommandTarget): boolean => {
      const issues = target.issues ?? [];
      const issue = issues[0];
      const path = target.path ?? location.pathname;

      switch (id) {
        case "open":
          navigate(path);
          return true;

        case "create-issue":
          openCreateIssue(
            target.teamId ? { teamId: target.teamId } : undefined,
          );
          return true;
        case "create-project":
          openCreateProject(target.teamId ?? undefined);
          return true;
        case "create-cycle":
          if (target.teamId) openCreateCycle(target.teamId);
          return true;

        case "cycle-current":
          void bulkCycleTarget(issues, "current");
          return true;
        case "cycle-next":
          void bulkCycleTarget(issues, "next");
          return true;

        case "copy-identifier":
          if (issue) void copyText(issue.identifier, issue.identifier);
          return true;
        case "copy-issue-link":
          if (issue) {
            void copyText(
              `${window.location.origin}/issue/${issue.identifier}`,
              "Issue link",
            );
          }
          return true;
        case "copy-project-link":
        case "copy-cycle-link":
        case "copy-view-link":
          void copyText(window.location.origin + path, "Link");
          return true;

        case "subscribe":
        case "unsubscribe":
          if (issue) {
            void callAction(
              "update-issue-subscription",
              { identifier: issue.identifier, subscribed: id === "subscribe" },
              { method: "PUT" },
            )
              .then(() => {
                toast(id === "subscribe" ? "Subscribed" : "Unsubscribed");
                void queryClient.invalidateQueries({
                  queryKey: ["action", "get-issue"],
                });
              })
              .catch(() => toast.error("Could not change your subscription."));
          }
          return true;

        case "archive":
          void bulkRemove(
            issues.filter((entry) => !entry.archivedAt),
            "archived",
          );
          selection?.reconcile({ clearAll: true });
          return true;
        case "unarchive":
          void bulkUnarchive(issues.filter((entry) => entry.archivedAt));
          selection?.reconcile({ clearAll: true });
          return true;
        case "delete":
          void bulkRemove(issues, "deleted");
          selection?.reconcile({ clearAll: true });
          return true;

        case "favorite":
        case "unfavorite":
          if (target.favorite) {
            void setFavorite(
              target.favorite.type,
              target.favorite.id,
              id === "favorite",
            ).then(() => invalidateWorkspace(queryClient));
          }
          return true;

        case "project-create-milestone":
          navigate(`/projects/${target.projectId ?? ""}`);
          return true;
        case "project-create-update":
          navigate(`/projects/${target.projectId ?? ""}/updates`);
          return true;
        case "cycle-edit":
          navigate(`/team/${target.teamKey ?? ""}/cycles`);
          return true;

        case "go-my-issues":
          navigate("/my-issues");
          return true;
        case "go-projects":
          navigate("/projects");
          return true;
        case "go-views":
          navigate("/views");
          return true;
        case "go-inbox":
          navigate("/inbox");
          return true;
        case "go-triage":
          if (target.teamKey) navigate(`/team/${target.teamKey}/triage`);
          return true;
        case "go-current-cycle":
          if (target.teamKey) navigate(`/team/${target.teamKey}/cycles`);
          return true;
        case "go-team-analytics":
          if (target.teamKey) navigate(`/team/${target.teamKey}/analytics`);
          return true;
        case "go-team-recurring":
          if (target.teamKey) navigate(`/team/${target.teamKey}/recurring`);
          return true;

        case "keyboard-shortcuts":
          openShortcutHelp();
          return true;
        case "search-workspace":
          // Deferred so a closing palette does not swallow the reopen.
          setTimeout(openGlobalSearch, 0);
          return true;
        case "inbox-mark-all-read":
          void markAllRead();
          return true;

        default:
          return false;
      }
    },
    [
      bulkCycleTarget,
      bulkRemove,
      bulkUnarchive,
      location.pathname,
      markAllRead,
      navigate,
      queryClient,
      selection,
      setFavorite,
    ],
  );

  return { runCommand, applyProperty };
}
