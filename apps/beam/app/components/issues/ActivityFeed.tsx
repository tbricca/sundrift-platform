import { PRIORITY_LABEL, type Priority } from "@/lib/issue-query";
import type { ActivityEntry, ActivityMetadata } from "@/lib/types";

import { formatRelative, formatShortDate } from "./primitives";
import { MemberAvatar } from "./primitives";

function refName(value: ActivityMetadata["to"]): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "object" && "name" in value) return value.name;
  return String(value);
}

/**
 * Activity rows store `{ field, from, to }` refs, never prose. All wording
 * lives here so new system events only need a case added.
 */
function describe(entry: ActivityEntry): string {
  const meta = entry.metadata ?? {};
  const to = refName(meta.to);
  const from = refName(meta.from);

  switch (entry.type) {
    case "created":
      // A generated issue says where it came from, so nobody has to work out
      // why an issue they never filed appeared on their board.
      return meta.recurringDefinitionName
        ? `created this from the recurring rule “${String(meta.recurringDefinitionName)}”`
        : "created the issue";
    case "status_changed":
      return from ? `changed status from ${from} to ${to}` : `set status to ${to}`;
    case "priority_changed":
      return `set priority to ${PRIORITY_LABEL[(meta.to as Priority) ?? "none"]}`;
    case "assignee_changed":
      return to ? `assigned ${to}` : "removed the assignee";
    case "project_changed":
      return to ? `added this to ${to}` : "removed this from its project";
    case "cycle_changed":
      return to ? `moved this to ${to}` : "removed this from its cycle";
    case "milestone_changed":
      return to ? `set the milestone to ${to}` : "cleared the milestone";
    case "parent_changed":
      return to ? `made this a sub-issue of ${to}` : "removed the parent issue";
    case "estimate_changed":
      return to ? `set the estimate to ${to}` : "cleared the estimate";
    case "dueDate_changed":
      return to
        ? `set the due date to ${formatShortDate(String(meta.to))}`
        : "cleared the due date";
    case "title_changed":
      return "renamed the issue";
    case "description_changed":
      return "updated the description";
    case "labels_changed": {
      const added = (meta.added ?? []).map((label) => label.name);
      const removed = (meta.removed ?? []).map((label) => label.name);
      const parts: string[] = [];
      if (added.length) parts.push(`added ${added.join(", ")}`);
      if (removed.length) parts.push(`removed ${removed.join(", ")}`);
      return parts.length ? `${parts.join(" and ")}` : "updated labels";
    }
    case "archived_changed":
      return meta.to ? "archived the issue" : "unarchived the issue";
    case "deleted_changed":
      return meta.to ? "deleted the issue" : "restored the issue";
    case "relation_added":
      return `marked this ${String(meta.relationType).replace("_", " ")} ${to}`;
    case "relation_removed":
      return `removed a ${String(meta.relationType).replace("_", " ")} link to ${from}`;
    case "commented":
      return "left a comment";
    case "triage_entered":
      return to ? `filed this into triage from ${to}` : "filed this into triage";
    case "triage_accepted":
      return meta.reason
        ? `accepted this out of triage — ${meta.reason}`
        : "accepted this out of triage";
    case "triage_declined":
      return meta.reason
        ? `declined this in triage — ${meta.reason}`
        : "declined this in triage";
    case "triage_snoozed":
      return `snoozed triage until ${formatShortDate(String(meta.to))}`;
    default:
      return entry.type.replace(/_/g, " ");
  }
}

export function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  if (activity.length === 0) {
    return <p className="text-[13px] text-muted-foreground">No activity yet.</p>;
  }

  return (
    <ol className="flex flex-col gap-2.5">
      {activity.map((entry) => (
        <li key={entry.id} className="flex items-center gap-2.5">
          <MemberAvatar member={entry.actor} size={18} />
          <span className="min-w-0 text-[12px] text-muted-foreground">
            <span className="font-medium text-foreground">
              {entry.actor?.name ?? "System"}
            </span>{" "}
            {describe(entry)}
          </span>
          <span className="beam-meta ms-auto shrink-0">
            {formatRelative(entry.createdAt)}
          </span>
        </li>
      ))}
    </ol>
  );
}
