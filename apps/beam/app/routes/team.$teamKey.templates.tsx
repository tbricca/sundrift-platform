import { Link, useParams } from "react-router";

import { TemplateList } from "@/components/templates/TemplateList";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Team templates — ${APP_TITLE}` }];
}

export default function TeamTemplatesRoute() {
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
          {team?.name ?? "Team"} · Templates
        </h1>
        {/* Recurring rules are reached from here rather than from a ninth
            sidebar row: they are templates on a schedule, and the sidebar is
            already dense. */}
        <Link
          to={`/team/${(teamKey ?? "").toUpperCase()}/recurring`}
          className="beam-meta ms-2 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          Recurring
        </Link>
      </header>
      <TemplateList teamId={team?.id} />
    </div>
  );
}
