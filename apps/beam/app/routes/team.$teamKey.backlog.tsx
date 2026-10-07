import { useMemo } from "react";
import { useParams } from "react-router";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { backlogQuery } from "@/lib/issue-query";

export function meta() {
  return [{ title: `Backlog — ${APP_TITLE}` }];
}

export default function TeamBacklogRoute() {
  const { teamKey } = useParams();
  const { team, isLoading } = useTeamByKey(teamKey);

  const baseQuery = useMemo(() => backlogQuery(team?.id ?? ""), [team?.id]);

  if (!isLoading && !team) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team “{teamKey}” was not found in this workspace.
      </div>
    );
  }

  return (
    <IssueViewSurface
      title={`${team?.name ?? "Team"} · Backlog`}
      accessory={
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
        />
      }
      baseQuery={baseQuery}
      context={{ type: "backlog", id: team?.id }}
      team={team}
      emptyMessage="Nothing in the backlog for this team."
    />
  );
}
