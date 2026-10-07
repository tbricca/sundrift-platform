import { useMemo } from "react";
import { useParams } from "react-router";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { teamIssuesQuery } from "@/lib/issue-query";

export function meta() {
  return [{ title: `Issues — ${APP_TITLE}` }];
}

export default function TeamIssuesRoute() {
  const { teamKey } = useParams();
  const { team, isLoading } = useTeamByKey(teamKey);

  const baseQuery = useMemo(
    () => teamIssuesQuery(team?.id ?? ""),
    [team?.id],
  );

  if (!isLoading && !team) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team “{teamKey}” was not found in this workspace.
      </div>
    );
  }

  return (
    <IssueViewSurface
      title={`${team?.name ?? "Team"} · Issues`}
      accessory={
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
        />
      }
      baseQuery={baseQuery}
      context={{ type: "team", id: team?.id }}
      team={team}
      emptyMessage="No issues yet for this team."
    />
  );
}
