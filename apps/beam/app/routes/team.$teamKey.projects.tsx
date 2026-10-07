import { useParams } from "react-router";

import { ProjectList } from "@/components/projects/ProjectList";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Team projects — ${APP_TITLE}` }];
}

export default function TeamProjectsRoute() {
  const { teamKey } = useParams();
  const { team, isLoading } = useTeamByKey(teamKey);

  if (!isLoading && !team) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team “{teamKey}” was not found in this workspace.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
        />
        <h1 className="text-[13px] font-semibold">
          {team?.name ?? "Team"} · Projects
        </h1>
      </header>
      <ProjectList
        teamId={team?.id}
        emptyMessage="This team is not part of any project yet."
      />
    </div>
  );
}
