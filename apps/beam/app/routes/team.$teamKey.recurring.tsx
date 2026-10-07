import { Link, useParams } from "react-router";

import { RecurringList } from "@/components/recurring/RecurringList";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Recurring issues — ${APP_TITLE}` }];
}

export default function TeamRecurringRoute() {
  const { teamKey } = useParams();
  const { team } = useTeamByKey(teamKey);
  const key = (teamKey ?? "").toUpperCase();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
        />
        <h1 className="text-[13px] font-semibold">
          {team?.name ?? "Team"} · Recurring
        </h1>
        {/* Templates and recurring rules are two halves of the same idea, so
            each links to the other rather than both claiming a sidebar row. */}
        <Link
          to={`/team/${key}/templates`}
          className="beam-meta ms-2 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground"
        >
          Templates
        </Link>
      </header>
      <RecurringList teamKey={key} teamId={team?.id} />
    </div>
  );
}
