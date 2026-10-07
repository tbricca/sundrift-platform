/**
 * Right-click menu for a cycle row.
 *
 * Only what a reader of the cycle would want: open it, file an issue into its
 * team, adjust its dates, favorite it, copy a link. Rollover and the other
 * maintenance operations stay out of a user-facing menu.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { cycleMenuModel } from "@/components/command/command-menu";
import { openCreateIssue } from "@/components/issues/CreateIssueDialog";
import { copyText } from "@/hooks/use-command-runner";
import { useFavorites } from "@/hooks/use-favorites";

import { EntityContextMenu } from "./EntityContextMenu";

export function CycleRowMenu({
  cycleId,
  teamId,
  teamKey,
  title,
  children,
}: {
  cycleId: string;
  teamId?: string;
  teamKey: string;
  title: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { entries, setFavorite } = useFavorites();
  const path = `/team/${teamKey}/cycles/${cycleId}`;

  const isFavorite = entries.some(
    (entry) => entry.entityType === "cycle" && entry.entityId === cycleId,
  );

  return (
    <EntityContextMenu
      sections={cycleMenuModel(isFavorite)}
      header={title}
      onSelect={(id) => {
        switch (id) {
          case "open":
            navigate(path);
            break;
          case "create-issue":
            openCreateIssue(teamId ? { teamId } : undefined);
            break;
          case "cycle-edit":
            navigate(`/team/${teamKey}/cycles`);
            break;
          case "copy-cycle-link":
            void copyText(window.location.origin + path, "Cycle link");
            break;
          case "favorite":
          case "unfavorite":
            void setFavorite("cycle", cycleId, id === "favorite");
            break;
        }
      }}
    >
      {children}
    </EntityContextMenu>
  );
}
