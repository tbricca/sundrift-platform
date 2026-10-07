/**
 * The team cycles page. Rows are as dense as issue rows and reuse the shared
 * ProgressBar so a cycle reads the same way a project does.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { IconPlus } from "@tabler/icons-react";
import { Link } from "react-router";

import { ProgressBar, type Progress } from "@/components/projects/primitives";
import { Skeleton } from "@/components/ui/skeleton";
import {
  cycleDaysRemaining,
  cycleElapsedPercent,
  cycleSubtitle,
  cycleTitle,
  formatCycleRange,
  type CycleStatus,
} from "@/lib/cycle";
import { cn } from "@/lib/utils";
import { CycleRowMenu } from "@/components/menus/CycleRowMenu";

import { openCreateCycle } from "./CreateCycleDialog";
import { CycleSettingsMenu, type CycleSettings } from "./CycleSettingsMenu";

export type CycleMetrics = Progress & {
  estimate: { completed: number; total: number } | null;
};

export type CycleSummary = {
  id: string;
  number: number;
  name: string | null;
  startsAt: string;
  endsAt: string;
  state: CycleStatus;
  metrics: CycleMetrics;
};

export type CyclesResponse = {
  team: {
    id: string;
    key: string;
    name: string;
    color: string | null;
    settings: CycleSettings;
  };
  current: CycleSummary | null;
  upcoming: CycleSummary[];
  previous: CycleSummary[];
  previousTotal: number;
};

export function useCycles(teamKey: string | undefined) {
  const query = useActionQuery<CyclesResponse | null>(
    "list-cycles",
    teamKey ? { teamKey } : {},
    { enabled: Boolean(teamKey) },
  );
  return { data: query.data ?? null, isLoading: query.isLoading };
}

export function EstimateTotals({
  metrics,
  className,
}: {
  metrics: CycleMetrics;
  className?: string;
}) {
  if (!metrics.estimate) return null;
  return (
    <span className={cn("beam-meta shrink-0 tabular-nums", className)}>
      {metrics.estimate.completed}/{metrics.estimate.total} pts
    </span>
  );
}

function CycleRow({
  cycle,
  teamKey,
  teamId,
  prominent,
}: {
  cycle: CycleSummary;
  teamKey: string;
  teamId?: string;
  prominent?: boolean;
}) {
  const subtitle = cycleSubtitle(cycle);
  const remaining =
    cycle.state === "active" ? cycleDaysRemaining(cycle) : null;

  return (
    <CycleRowMenu
      cycleId={cycle.id}
      teamId={teamId}
      teamKey={teamKey}
      title={cycleTitle(cycle)}
    >
    <Link
      to={`/team/${teamKey}/cycles/${cycle.id}`}
      className={cn(
        "flex items-center gap-3 border-b border-border/70 px-3 text-[13px] outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60",
        prominent ? "h-12" : "h-11",
        cycle.state === "completed" && "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "shrink-0 font-medium text-foreground",
          prominent && "text-[14px]",
        )}
      >
        {cycleTitle(cycle)}
      </span>

      {subtitle ? (
        <span className="beam-meta min-w-0 max-w-[220px] truncate">
          {subtitle}
        </span>
      ) : null}

      <span className="beam-meta hidden shrink-0 sm:inline">
        {formatCycleRange(cycle)}
      </span>

      {remaining !== null ? (
        <span className="beam-chip hidden shrink-0 md:inline-flex">
          {remaining === 0 ? "Ends today" : `${remaining}d left`}
        </span>
      ) : null}

      <span className="ms-auto flex items-center gap-3">
        <EstimateTotals metrics={cycle.metrics} className="hidden lg:inline" />
        <ProgressBar progress={cycle.metrics} className="shrink-0" />
      </span>
    </Link>
    </CycleRowMenu>
  );
}

function Section({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex h-8 items-center gap-2 bg-muted/40 px-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {count !== undefined ? (
          <span className="font-normal tabular-nums opacity-70">{count}</span>
        ) : null}
      </h2>
      {children}
    </section>
  );
}

export function CycleList({ teamKey }: { teamKey: string }) {
  const { data, isLoading } = useCycles(teamKey);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1 p-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <p className="p-8 text-center text-[13px] text-muted-foreground">
        Team “{teamKey}” was not found in this workspace.
      </p>
    );
  }

  const { team, current, upcoming, previous } = data;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <span className="beam-meta mr-1">
          {team.settings.cyclesEnabled
            ? `${team.settings.durationWeeks}-week cycles`
            : "Cycles disabled"}
        </span>
        <CycleSettingsMenu teamId={team.id} settings={team.settings} />
        <button
          type="button"
          onClick={() => openCreateCycle(team.id)}
          className="ms-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[12px] font-medium transition-colors hover:bg-accent"
        >
          <IconPlus className="size-3.5" />
          New cycle
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section label="Current">
          {current ? (
            <>
              <CycleRow cycle={current} teamKey={teamKey} teamId={team.id} prominent />
              <p className="beam-meta px-3 py-1.5">
                {cycleElapsedPercent(current)}% of the cycle elapsed
              </p>
            </>
          ) : (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              No cycle is running right now.
            </p>
          )}
        </Section>

        <Section label="Upcoming" count={upcoming.length}>
          {upcoming.length ? (
            upcoming.map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} teamKey={teamKey} teamId={team.id} />
            ))
          ) : (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              No upcoming cycles.
            </p>
          )}
        </Section>

        <Section label="Previous" count={data.previousTotal}>
          {previous.length ? (
            previous.map((cycle) => (
              <CycleRow key={cycle.id} cycle={cycle} teamKey={teamKey} teamId={team.id} />
            ))
          ) : (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              No finished cycles yet.
            </p>
          )}
          {data.previousTotal > previous.length ? (
            <p className="beam-meta px-3 py-2">
              Showing the {previous.length} most recent of{" "}
              {data.previousTotal} finished cycles.
            </p>
          ) : null}
        </Section>
      </div>
    </div>
  );
}
