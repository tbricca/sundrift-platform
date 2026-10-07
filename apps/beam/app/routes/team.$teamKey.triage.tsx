import { IconInbox } from "@tabler/icons-react";
import { useParams } from "react-router";

import { TriageQueue } from "@/components/triage/TriageQueue";
import { useTriageSettings } from "@/components/triage/TriageSettingsMenu";
import type { WorkspaceTeam } from "@/components/issues/properties";
import { useTeamByKey } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Triage — ${APP_TITLE}` }];
}

export default function TeamTriageRoute() {
  const { teamKey } = useParams();
  const { team, isLoading } = useTeamByKey(teamKey);

  if (!isLoading && !team) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        Team “{teamKey}” was not found in this workspace.
      </div>
    );
  }

  if (team && !team.triageEnabled) {
    return <TriageDisabled team={team} />;
  }

  return <TriageQueue team={team} />;
}

function TriageDisabled({ team }: { team: WorkspaceTeam }) {
  const save = useTriageSettings(team.id);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
        <IconInbox className="size-5" />
      </div>
      <p className="text-sm text-muted-foreground">
        Triage is off for {team.name}.
      </p>
      <p className="beam-meta max-w-xs">
        Turn it on and issues filed with <code>triage: true</code> — by an
        agent, an intake or an API call — wait here for review instead of
        landing straight on the board.
      </p>
      <button
        type="button"
        onClick={() => void save({ triageEnabled: true })}
        className="inline-flex h-8 cursor-pointer items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
      >
        Enable triage
      </button>
    </div>
  );
}
