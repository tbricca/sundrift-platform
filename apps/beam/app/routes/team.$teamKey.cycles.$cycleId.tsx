import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconArrowLeft } from "@tabler/icons-react";
import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";

import { CycleAnalyticsBar } from "@/components/analytics/CycleAnalyticsBar";
import {
  EstimateTotals,
  type CycleSummary,
} from "@/components/cycles/CycleList";
import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { ProgressBar } from "@/components/projects/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeamByKey } from "@/hooks/use-workspace";
import { publishCycleContext } from "@/lib/agent-cycle-context";
import { APP_TITLE } from "@/lib/app-config";
import {
  CYCLE_STATE_LABEL,
  cycleDaysRemaining,
  cycleSubtitle,
  cycleTitle,
  formatCycleRange,
} from "@/lib/cycle";
import { cycleQuery } from "@/lib/issue-query";

export function meta() {
  return [{ title: `Cycle — ${APP_TITLE}` }];
}

type CycleDetail = CycleSummary & {
  team: { id: string; key: string; name: string; color: string | null };
};

export default function CycleDetailRoute() {
  const { teamKey = "", cycleId = "" } = useParams();
  const { team } = useTeamByKey(teamKey);

  const params = useMemo(() => ({ cycleId }), [cycleId]);
  const query = useActionQuery<CycleDetail | null>("get-cycle", params);
  const cycle = query.data ?? null;

  // The one cycle preset over the same engine every other issue surface uses.
  const baseQuery = useMemo(() => cycleQuery(cycleId), [cycleId]);

  useEffect(() => {
    if (!cycle) return;
    publishCycleContext({
      id: cycle.id,
      number: cycle.number,
      name: cycle.name,
      state: cycle.state,
      startsAt: cycle.startsAt,
      endsAt: cycle.endsAt,
      progress: {
        completed: cycle.metrics.completed,
        total: cycle.metrics.total,
        percent: cycle.metrics.percent,
      },
      teamKey: cycle.team.key,
    });
    return () => publishCycleContext(null);
  }, [cycle]);

  if (query.isLoading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    );
  }

  if (!cycle) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        That cycle no longer exists.
      </div>
    );
  }

  const subtitle = cycleSubtitle(cycle);

  return (
    <IssueViewSurface
      title={cycleTitle(cycle)}
      accessory={
        <Link
          to={`/team/${teamKey}/cycles`}
          aria-label="Back to cycles"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconArrowLeft className="size-4" />
        </Link>
      }
      meta={
        <span className="flex min-w-0 items-center gap-2">
          {subtitle ? (
            <span className="beam-meta truncate">{subtitle}</span>
          ) : null}
          <span className="beam-chip shrink-0">
            {CYCLE_STATE_LABEL[cycle.state]}
          </span>
          <span className="beam-meta hidden shrink-0 sm:inline">
            {formatCycleRange(cycle)}
          </span>
          {cycle.state === "active" ? (
            <span className="beam-meta hidden shrink-0 md:inline">
              {cycleDaysRemaining(cycle)}d left
            </span>
          ) : null}
          <ProgressBar
            progress={cycle.metrics}
            className="hidden shrink-0 lg:flex"
          />
          <EstimateTotals metrics={cycle.metrics} className="hidden xl:inline" />
        </span>
      }
      tabs={<CycleAnalyticsBar cycleId={cycleId} />}
      baseQuery={baseQuery}
      context={{ type: "cycle", id: cycleId }}
      team={team}
      emptyMessage="No issues in this cycle yet."
    />
  );
}
