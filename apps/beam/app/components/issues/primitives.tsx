import { IconRobot } from "@tabler/icons-react";

import { PRIORITY_LABEL, type Priority } from "@/lib/issue-query";
import type { MemberRef, StatusRef } from "@/lib/types";
import { cn } from "@/lib/utils";

const PRIORITY_BARS: Record<Priority, number> = {
  none: 0,
  low: 1,
  medium: 2,
  high: 3,
  urgent: 3,
};

const PRIORITY_TOKEN: Record<Priority, string> = {
  none: "var(--priority-none)",
  low: "var(--priority-low)",
  medium: "var(--priority-medium)",
  high: "var(--priority-high)",
  urgent: "var(--priority-urgent)",
};

export function PriorityIcon({
  priority,
  className,
}: {
  priority: Priority;
  className?: string;
}) {
  const color = `hsl(${PRIORITY_TOKEN[priority]})`;

  if (priority === "urgent") {
    return (
      <span
        aria-label={PRIORITY_LABEL.urgent}
        className={cn(
          "inline-flex size-4 items-center justify-center rounded-[3px] text-[10px] font-bold text-white",
          className,
        )}
        style={{ backgroundColor: color }}
      >
        !
      </span>
    );
  }

  const filled = PRIORITY_BARS[priority];
  return (
    <span
      aria-label={PRIORITY_LABEL[priority]}
      className={cn(
        "inline-flex size-4 items-end justify-center gap-[2px]",
        className,
      )}
    >
      {[0, 1, 2].map((index) => (
        <span
          key={index}
          className="w-[3px] rounded-[1px]"
          style={{
            height: `${5 + index * 3}px`,
            backgroundColor:
              index < filled ? color : "hsl(var(--muted-foreground) / 0.28)",
          }}
        />
      ))}
    </span>
  );
}

export function StatusIcon({
  status,
  className,
}: {
  status: Pick<StatusRef, "color" | "category">;
  className?: string;
}) {
  if (status.category === "completed") {
    return (
      <svg
        viewBox="0 0 14 14"
        className={cn("size-3.5 shrink-0", className)}
        aria-hidden="true"
      >
        <circle cx="7" cy="7" r="6" fill={status.color} />
        <path
          d="M4.2 7.2l1.9 1.9 3.7-3.9"
          fill="none"
          stroke="hsl(var(--background))"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const progress =
    status.category === "started"
      ? 0.55
      : status.category === "canceled"
        ? 1
        : 0;

  return (
    <svg
      viewBox="0 0 14 14"
      className={cn("size-3.5 shrink-0", className)}
      aria-hidden="true"
    >
      <circle
        cx="7"
        cy="7"
        r="5.4"
        fill="none"
        stroke={status.color}
        strokeWidth="1.6"
        strokeDasharray={status.category === "backlog" ? "2 2" : undefined}
      />
      {progress > 0 ? (
        <circle
          cx="7"
          cy="7"
          r="2.6"
          fill="none"
          stroke={status.color}
          strokeWidth="5.2"
          strokeDasharray={`${progress * 16.3} 16.3`}
          transform="rotate(-90 7 7)"
        />
      ) : null}
    </svg>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

const AVATAR_HUES = [243, 199, 160, 27, 340, 280];

export function MemberAvatar({
  member,
  size = 20,
  className,
}: {
  member: MemberRef | null;
  size?: number;
  className?: string;
}) {
  if (!member) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/45 text-muted-foreground",
          className,
        )}
        style={{ width: size, height: size }}
        aria-label="Unassigned"
      >
        <svg viewBox="0 0 16 16" className="size-2.5" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.6" fill="currentColor" />
          <path
            d="M2.6 14c.8-2.9 2.9-4.4 5.4-4.4S12.6 11.1 13.4 14"
            fill="currentColor"
          />
        </svg>
      </span>
    );
  }

  const hue = AVATAR_HUES[member.name.length % AVATAR_HUES.length];
  const isAgent = member.kind === "agent";

  return (
    <span
      title={isAgent ? `${member.name} (agent)` : member.name}
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden font-semibold text-white",
        isAgent ? "rounded-[5px]" : "rounded-full",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.42),
        backgroundColor: `hsl(${hue} 62% 52%)`,
      }}
    >
      {isAgent ? (
        <IconRobot style={{ width: size * 0.62, height: size * 0.62 }} />
      ) : (
        initials(member.name)
      )}
    </span>
  );
}

export function LabelChip({
  label,
}: {
  label: { name: string; color: string };
}) {
  return (
    <span className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full border border-border px-2 text-[11px] font-medium text-muted-foreground">
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: label.color }}
      />
      {label.name}
    </span>
  );
}

export function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

export function formatRelative(value: string | null): string {
  if (!value) return "";
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.round(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d`;
  return formatShortDate(value);
}
