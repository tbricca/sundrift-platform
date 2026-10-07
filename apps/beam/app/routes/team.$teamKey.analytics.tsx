import { useParams } from "react-router";

import { TeamAnalytics } from "@/components/analytics/TeamAnalytics";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Analytics — ${APP_TITLE}` }];
}

export default function TeamAnalyticsRoute() {
  const { teamKey } = useParams();
  const { team } = useTeamByKey(teamKey);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <span
          className="size-2.5 shrink-0 rounded-[3px]"
          style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
        />
        <h1 className="text-[13px] font-semibold">
          {team?.name ?? "Team"} · Analytics
        </h1>
      </header>
      <TeamAnalytics teamKey={(teamKey ?? "").toUpperCase()} />
    </div>
  );
}
