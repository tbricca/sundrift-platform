/**
 * A single line of cycle analytics, shown under the cycle toolbar.
 *
 * Deliberately only the figures the cycle header does not already carry. The
 * header shows progress and estimate totals; repeating them here would be
 * noise, so this adds the planning view: what the cycle committed to, how much
 * of that landed, and how much the scope moved underneath it.
 *
 * Committed scope comes from membership history, which Beam only started
 * recording at `teams.cycle_history_started_at`. For a cycle that began before
 * that, the server sends no scope at all and this shows a short explanation
 * instead. It never shows a zero it cannot stand behind.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";

import { Comparison } from "@/components/analytics/primitives";
import {
  SCOPE_UNAVAILABLE,
  compareTo,
  formatCommitted,
  formatDuration,
  formatScopeChange,
} from "@/lib/analytics";
import type { CycleAnalytics } from "../../../server/analytics";

export function CycleAnalyticsBar({ cycleId }: { cycleId: string }) {
  const query = useActionQuery<CycleAnalytics | null>(
    "get-cycle-analytics",
    { cycleId },
    { enabled: Boolean(cycleId) },
  );

  const data = query.data;
  if (!data) return null;

  const { current, previous } = data;
  const comparison = previous
    ? compareTo(
        current.metrics.completed,
        previous.metrics.completed,
        previousLabel(previous),
      )
    : null;

  const scope = current.scope;
  const churn = scope ? formatScopeChange(scope.added, scope.removed) : null;
  // A finished cycle is judged on what it pushed forward; a running one on
  // what it inherited. Only one of the two is ever interesting at a time.
  const carried = scope?.carriedOut
    ? { label: "Carried out", value: scope.carriedOut }
    : scope?.carriedIn
      ? { label: "Carried in", value: scope.carriedIn }
      : null;

  return (
    <div className="flex h-8 shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border px-4">
      <Figure
        label="Done"
        value={
          current.metrics.percent === null ? "—" : `${current.metrics.percent}%`
        }
      />

      {scope ? (
        <Figure
          label="Committed"
          value={formatCommitted(scope.committedCompleted, scope.committed)}
          title="Issues that were in this cycle when it started, and how many of those finished before it ended. Work moved out later still counts against the commitment."
        />
      ) : (
        <span
          className="beam-meta truncate"
          title={SCOPE_UNAVAILABLE}
        >
          Scope history unavailable
        </span>
      )}

      {churn ? (
        <Figure
          label="Scope"
          value={churn}
          title="Issues added to and removed from this cycle after it started. Completing an issue is not a removal."
        />
      ) : null}

      {carried ? (
        <Figure
          label={carried.label}
          value={String(carried.value)}
          title="Unfinished work moved between cycles by rollover."
        />
      ) : null}

      <Figure
        label="Median"
        value={formatDuration(current.completionTime?.medianSeconds)}
      />

      {comparison ? (
        <span className="flex items-center gap-1.5">
          <span className="beam-meta uppercase tracking-wide">Completed</span>
          <Comparison comparison={comparison} />
        </span>
      ) : null}
    </div>
  );
}

function previousLabel(previous: CycleAnalytics["previous"]) {
  if (!previous) return "previous";
  return previous.name ?? `Cycle ${previous.number}`;
}

function Figure({
  label,
  value,
  title,
}: {
  label: string;
  value: string;
  title?: string;
}) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      <span className="beam-meta uppercase tracking-wide">{label}</span>
      <span className="text-[12px] font-semibold tabular-nums">{value}</span>
    </span>
  );
}
