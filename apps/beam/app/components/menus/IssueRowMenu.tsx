/**
 * Wraps an issue row or board card in the shared issue context menu and
 * decides what the menu acts on.
 *
 * The rule: right-clicking inside the selection acts on the whole selection;
 * right-clicking outside it makes that row the only target. A bulk write the
 * user did not line up is the one surprise worth designing away.
 */
import type { ReactNode } from "react";

import { selectionScope } from "@/components/issues/BulkActionBar";
import type { PropertyContext } from "@/components/issues/properties";
import type { SelectionState } from "@/components/issues/selection";
import {
  IssueContextMenu,
  type TriageAction,
} from "@/components/menus/IssueContextMenu";
import type { CommandContext } from "@/components/command/commands";
import type { IssueListItem, WorkspaceBootstrap } from "@/lib/types";

/**
 * The command context for a set of issues. Archive and unarchive read
 * `anyArchived`/`allArchived` from it, so a menu on an archived row offers
 * Unarchive without anyone writing that rule twice.
 */
export function issueCommandContext(
  issues: IssueListItem[],
  extra: Partial<CommandContext> = {},
): CommandContext {
  return {
    count: issues.length,
    hasIssue: issues.length > 0,
    hasTeam: true,
    hasProject: false,
    hasCycle: false,
    inInbox: false,
    hasTriage: false,
    anyArchived: issues.some((issue) => Boolean(issue.archivedAt)),
    allArchived:
      issues.length > 0 && issues.every((issue) => Boolean(issue.archivedAt)),
    ...extra,
  };
}

export function IssueRowMenu({
  issue,
  selection,
  workspace,
  ctx,
  triage,
  onTriage,
  children,
}: {
  issue: IssueListItem;
  selection: SelectionState;
  workspace: WorkspaceBootstrap | null;
  ctx: PropertyContext;
  triage?: boolean;
  onTriage?: (action: TriageAction, issues: IssueListItem[]) => void;
  children: ReactNode;
}) {
  const inSelection = selection.selectedIds.includes(issue.id);
  const issues =
    inSelection && selection.selected.length > 1 ? selection.selected : [issue];
  const scope = selectionScope(issues, workspace);

  return (
    <IssueContextMenu
      issues={issues}
      ctx={{ ...ctx, team: scope.team ?? ctx.team, projectId: scope.projectId }}
      commandContext={issueCommandContext(issues)}
      scope={scope}
      triage={triage}
      onTriage={onTriage}
      onOpenChange={(open) => {
        if (open && !inSelection) {
          selection.clear();
          selection.focus(issue.id);
        }
      }}
    >
      {children}
    </IssueContextMenu>
  );
}
