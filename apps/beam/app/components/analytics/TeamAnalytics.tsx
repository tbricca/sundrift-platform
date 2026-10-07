/**
 * The team analytics page.
 *
 * Every number here is computed in SQL by `server/analytics.ts`; this file only
 * decides what is worth showing and how absences are worded. The range lives in
 * the URL so a link to a surprising figure shows the same figure to whoever
 * opens it.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useEffect } from "react";
import { useSearchParams } from "react-router";

import { publishAnalyticsContext } from "@/lib/agent-analytics-context";

import {
  AnalyticsEmpty,
  Metric,
  MetricRow,
  TrendChart,
} from "@/components/analytics/primitives";
import {
  NO_DATA,
  RANGES,
  RANGE_LABEL,
  formatCount,
  formatDuration,
  formatPercent,
  parseRange,
  type RangeKey,
} from "@/lib/analytics";
import { cn } from "@/lib/utils";
import type { TeamAnalytics as TeamAnalyticsData } from "../../../server/analytics";

type Response =
  | (TeamAnalyticsData & {
      team: { id: string; key: string; name: string };
      range: RangeKey;
    })
  | null;

export function TeamAnalytics({ teamKey }: { teamKey: string }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = parseRange(searchParams.get("range"));

  const query = useActionQuery<Response>(
    "get-team-analytics",
    { teamKey, range },
    { enabled: Boolean(teamKey) },
  );

  const setRange = (next: RangeKey) => {
    setSearchParams(
      (current) => {
        const params = new URLSearchParams(current);
        params.set("range", next);
        return params;
      },
      { replace: true, preventScrollReset: true },
    );
  };

  const data = query.data;

  // Let view-screen describe the figures on screen rather than the URL alone.
  useEffect(() => {
    if (!data) return;
    publishAnalyticsContext({
      teamKey: data.team.key,
      range: data.range,
      window: { start: data.window.start, end: data.window.end },
      created: data.created,
      completed: data.completed,
      canceled: data.canceled,
      completionRate: data.completionRate,
      medianCompletionSeconds: data.completionTime?.medianSeconds ?? null,
    });
    return () => publishAnalyticsContext(null);
  }, [data]);

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="beam-meta font-normal">
          Last {RANGE_LABEL[range]} · UTC
        </span>
        <RangePicker value={range} onChange={setRange} />
      </div>

      {query.isLoading ? (
        <AnalyticsEmpty>Loading…</AnalyticsEmpty>
      ) : !data ? (
        <AnalyticsEmpty>No analytics for this team</AnalyticsEmpty>
      ) : (
        <>
          <MetricRow>
            <Metric label="Created" value={formatCount(data.created)} />
            <Metric label="Completed" value={formatCount(data.completed)} />
            <Metric
              label="Median time to complete"
              value={formatDuration(data.completionTime?.medianSeconds)}
              hint={
                data.completionTime
                  ? `p75 ${formatDuration(data.completionTime.p75Seconds)}`
                  : "Not enough completed issues yet"
              }
            />
            <Metric
              label="Completion rate"
              value={formatPercent(data.completionRate)}
              hint={
                data.completionRate === null
                  ? "Nothing resolved yet"
                  : `${data.completed} shipped, ${data.canceled} canceled`
              }
            />
          </MetricRow>

          <section className="rounded-md border border-border p-3">
            <h2 className="beam-meta mb-3 uppercase tracking-wide">
              Created vs completed
            </h2>
            <TrendChart
              data={data.trend}
              granularity={data.window.granularity}
            />
          </section>

          <MetricRow className="sm:grid-cols-3">
            <Metric
              label="Canceled"
              value={formatCount(data.canceled)}
              hint="Not counted as completed"
            />
            <Metric
              label="Estimate completed"
              value={
                data.completedEstimate === null
                  ? NO_DATA
                  : `${formatCount(data.completedEstimate)} pts`
              }
              hint={
                data.completedEstimate === null
                  ? "No estimates recorded"
                  : undefined
              }
            />
            <Metric
              label="Completed by"
              value={`${data.completedBy.human} / ${data.completedBy.agent}`}
              hint={`human / agent · ${data.completedBy.unassigned} unassigned`}
            />
          </MetricRow>

          <p className="beam-meta max-w-prose font-normal leading-relaxed">
            Counts exclude issues still awaiting triage and issues that have
            been deleted. Archived issues are included, so archiving does not
            change past figures. Days are UTC.
          </p>
        </>
      )}
    </div>
  );
}

function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (next: RangeKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Time range"
      className="flex items-center gap-px overflow-hidden rounded-md border border-border"
    >
      {RANGES.map((range) => (
        <button
          key={range}
          type="button"
          role="tab"
          aria-selected={range === value}
          onClick={() => onChange(range)}
          className={cn(
            "h-6 px-2.5 text-[12px] font-medium transition-colors",
            range === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted/60",
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
