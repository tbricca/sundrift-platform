/**
 * The last few runs of one rule.
 *
 * Enough to answer "did it fire, and what did it make" — not a job monitor.
 * A failed run shows its recorded reason inline, because that reason is the
 * only place a team learns their template went missing.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { Link } from "react-router";

import { cn } from "@/lib/utils";

type Run = {
  id: string;
  scheduledFor: string | null;
  status: "pending" | "succeeded" | "failed" | "skipped";
  manual: boolean;
  error: string | null;
  createdAt: string | null;
  identifier: string | null;
};

type Response = { runs: Run[] } | null;

const STATUS_STYLE: Record<Run["status"], string> = {
  succeeded: "text-emerald-600 dark:text-emerald-500",
  failed: "text-destructive",
  pending: "text-muted-foreground",
  skipped: "text-muted-foreground",
};

function when(run: Run): string {
  const iso = run.scheduledFor ?? run.createdAt;
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function RunHistory({ ruleId }: { ruleId: string }) {
  const query = useActionQuery<Response>(
    "get-recurring-issue",
    { id: ruleId },
    { enabled: Boolean(ruleId) },
  );

  const runs = query.data?.runs ?? [];

  if (query.isLoading) {
    return (
      <p className="beam-meta px-3 pb-2.5 font-normal">Loading runs…</p>
    );
  }

  if (runs.length === 0) {
    return (
      <p className="beam-meta px-3 pb-2.5 font-normal">
        This rule has not run yet.
      </p>
    );
  }

  return (
    <div className="border-t border-border/70 bg-muted/30 px-3 py-1.5">
      {runs.map((run) => (
        <div
          key={run.id}
          className="flex items-baseline gap-2 py-1 text-[12px]"
        >
          <span className="beam-meta w-28 shrink-0 font-normal">
            {when(run)}
          </span>
          <span
            className={cn("w-20 shrink-0 font-medium", STATUS_STYLE[run.status])}
          >
            {run.status}
          </span>
          {run.manual ? (
            <span className="beam-meta shrink-0 font-normal">manual</span>
          ) : null}
          {run.identifier ? (
            <Link
              to={`/issue/${run.identifier}`}
              className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {run.identifier}
            </Link>
          ) : null}
          {run.error ? (
            <span className="truncate text-destructive">{run.error}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
