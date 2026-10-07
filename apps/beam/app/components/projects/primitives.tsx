/**
 * Shared project vocabulary: status, health, progress. Health is a small dot
 * rather than a banner so a project row stays as dense as an issue row.
 */
import {
  IconCircleCheck,
  IconCircleDashed,
  IconCircleX,
  IconPlayerPause,
  IconProgress,
  IconTargetArrow,
  type Icon,
} from "@tabler/icons-react";

import { cn } from "@/lib/utils";

export type ProjectStatus =
  | "backlog"
  | "planned"
  | "started"
  | "paused"
  | "completed"
  | "canceled";

export type ProjectHealth = "no_update" | "on_track" | "at_risk" | "off_track";

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  backlog: "Backlog",
  planned: "Planned",
  started: "In Progress",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
};

export const PROJECT_STATUS_ORDER: ProjectStatus[] = [
  "backlog",
  "planned",
  "started",
  "paused",
  "completed",
  "canceled",
];

const STATUS_ICON: Record<ProjectStatus, Icon> = {
  backlog: IconCircleDashed,
  planned: IconTargetArrow,
  started: IconProgress,
  paused: IconPlayerPause,
  completed: IconCircleCheck,
  canceled: IconCircleX,
};

const STATUS_TONE: Record<ProjectStatus, string> = {
  backlog: "text-muted-foreground",
  planned: "text-muted-foreground",
  started: "text-[hsl(var(--status-started))]",
  paused: "text-muted-foreground",
  completed: "text-[hsl(var(--status-completed))]",
  canceled: "text-muted-foreground",
};

export const PROJECT_HEALTH_LABEL: Record<ProjectHealth, string> = {
  no_update: "No update",
  on_track: "On track",
  at_risk: "At risk",
  off_track: "Off track",
};

export const PROJECT_HEALTH_ORDER: ProjectHealth[] = [
  "on_track",
  "at_risk",
  "off_track",
  "no_update",
];

const HEALTH_TONE: Record<ProjectHealth, string> = {
  no_update: "bg-muted-foreground/40",
  on_track: "bg-[hsl(var(--status-completed))]",
  at_risk: "bg-[hsl(var(--priority-high))]",
  off_track: "bg-destructive",
};

export function ProjectStatusIcon({
  status,
  className,
}: {
  status: ProjectStatus;
  className?: string;
}) {
  const Icon = STATUS_ICON[status];
  return <Icon className={cn("size-4 shrink-0", STATUS_TONE[status], className)} />;
}

export function HealthDot({ health }: { health: ProjectHealth }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", HEALTH_TONE[health])}
    />
  );
}

export function HealthLabel({ health }: { health: ProjectHealth }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <HealthDot health={health} />
      <span className="truncate">{PROJECT_HEALTH_LABEL[health]}</span>
    </span>
  );
}

export type Progress = {
  completed: number;
  total: number;
  percent: number | null;
};

export function ProgressBar({
  progress,
  className,
}: {
  progress: Progress;
  className?: string;
}) {
  // A project with no issues has no progress to report — 0% would imply work
  // has started and stalled.
  if (progress.percent === null) {
    return (
      <span className={cn("beam-meta", className)}>No issues yet</span>
    );
  }
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className="block h-full rounded-full bg-primary transition-[width]"
          style={{ width: `${progress.percent}%` }}
        />
      </span>
      <span className="beam-meta tabular-nums">
        {progress.completed}/{progress.total}
      </span>
    </span>
  );
}

export function formatProjectDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function isOverdue(targetDate: string | null, done: boolean): boolean {
  if (!targetDate || done) return false;
  return new Date(targetDate).getTime() < Date.now();
}
