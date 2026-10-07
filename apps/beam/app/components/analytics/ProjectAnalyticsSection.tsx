/**
 * Analytics on the project overview.
 *
 * A section rather than its own tab: there are five figures and a sparkline,
 * which is not enough to justify a navigation destination.
 *
 * These cover the issues the project holds now. Beam does not record project
 * reassignment, so work moved in from elsewhere counts here in full and work
 * moved out does not count at all — the section says so rather than implying a
 * historical replay it cannot perform.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";

import {
  AnalyticsEmpty,
  Metric,
  MetricRow,
  TrendChart,
} from "@/components/analytics/primitives";
import { NO_DATA, formatCount, formatDuration } from "@/lib/analytics";
import type { ProjectAnalytics } from "../../../server/analytics";

export function ProjectAnalyticsSection({ projectId }: { projectId: string }) {
  const query = useActionQuery<ProjectAnalytics | null>(
    "get-project-analytics",
    { projectId },
    { enabled: Boolean(projectId) },
  );

  const data = query.data;
  if (!data) return null;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="beam-meta uppercase tracking-wide">Analytics</h2>

      {data.total === 0 ? (
        <AnalyticsEmpty>No issues in this project yet</AnalyticsEmpty>
      ) : (
        <>
          <MetricRow>
            <Metric
              label="Completed"
              value={`${formatCount(data.completed)} / ${formatCount(data.total)}`}
              hint={data.canceled > 0 ? `${data.canceled} canceled` : undefined}
            />
            <Metric
              label="Estimate done"
              value={
                data.completedEstimate === null
                  ? NO_DATA
                  : `${data.completedEstimate} / ${data.totalEstimate} pts`
              }
              hint={
                data.completedEstimate === null
                  ? "No estimates recorded"
                  : undefined
              }
            />
            <Metric
              label="Median time to complete"
              value={formatDuration(data.completionTime?.medianSeconds)}
              hint={
                data.completionTime
                  ? `over ${data.completionTime.sampleSize} completed`
                  : "Not enough completed issues yet"
              }
            />
            <Metric
              label={`Done in ${data.recentDays}d`}
              value={formatCount(data.recentCompleted)}
              hint="Recent throughput"
            />
          </MetricRow>

          <div className="rounded-md border border-border p-3">
            <TrendChart data={data.trend} granularity={data.granularity} />
            <p className="beam-meta mt-2 font-normal leading-relaxed">
              Based on the issues this project holds now — Beam does not track
              when work moved between projects.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
