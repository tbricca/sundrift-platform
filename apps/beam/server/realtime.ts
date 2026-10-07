/**
 * Publishes entity-scoped change events onto the framework's existing sync
 * stream (SSE with a poll fallback, `/_agent-native/events`). No new transport
 * and no second connection: `recordChange` feeds the same stream the app root
 * already subscribes to.
 *
 * The framework emits one event per mutating action, but it only carries the
 * action *name*. Beam adds these events so the client can invalidate the two
 * or three caches that actually changed instead of everything keyed on
 * `["action"]`.
 *
 * This is a synchronization signal, never a source of truth: an event says
 * "this issue moved", and the client re-reads it through the normal action.
 */
import { recordChange } from "@agent-native/core/server/poll";

import type { BeamChangeEvent } from "../app/lib/realtime-events";

/**
 * Fire and forget. A realtime failure must never fail the write that caused
 * it — the client still recovers on its next read or reconnect.
 */
export function publishChange(event: BeamChangeEvent): void {
  try {
    recordChange({
      source: "beam",
      type: event.entity,
      key: event.id,
      ...event,
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[beam] realtime publish failed", error);
    }
  }
}

export function publishIssueChange(input: {
  id: string;
  version?: number;
  projectId?: string | null;
  cycleId?: string | null;
  triage?: boolean;
  deleted?: boolean;
}): void {
  publishChange({
    entity: "issue",
    id: input.id,
    // Not `version`: the change log stamps its own cursor under that name.
    issueVersion: input.version,
    projectId: input.projectId ?? undefined,
    cycleId: input.cycleId ?? undefined,
    triage: input.triage,
    deleted: input.deleted,
  });
}

export function publishCommentChange(issueId: string): void {
  publishChange({ entity: "comment", issueId });
}

/** One event per affected recipient; the client filters to its own member. */
export function publishNotificationChange(recipientIds: string[]): void {
  for (const id of new Set(recipientIds)) {
    publishChange({ entity: "notification", id });
  }
}

export function publishProjectChange(projectId: string): void {
  publishChange({ entity: "project", id: projectId, projectId });
}

export function publishCycleChange(cycleId: string): void {
  publishChange({ entity: "cycle", id: cycleId, cycleId });
}

export function publishViewChange(viewId: string): void {
  publishChange({ entity: "view", id: viewId });
}

export function publishTemplateChange(
  templateId: string,
  teamId: string,
): void {
  publishChange({ entity: "template", id: templateId, teamId });
}

/** Links live inside a detail surface, so the event names which one. */
export function publishLinkChange(
  entityType: "issue" | "project",
  entityId: string,
): void {
  publishChange({ entity: "link", id: entityId, linkEntity: entityType });
}
