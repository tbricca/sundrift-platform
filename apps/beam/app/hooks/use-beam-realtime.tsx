/**
 * The one realtime subscriber in Beam.
 *
 * Mounted once near the layout root. Nothing else in the app opens a
 * subscription: rows, panes and counters react because their queries were
 * invalidated, not because they are each listening. A browser tab holds one
 * SSE connection no matter how many features depend on it.
 *
 * Transport is the framework's existing `/_agent-native/events` stream (SSE
 * with a poll fallback) — the same one `useDbSync` already uses in the app
 * root — so this adds routing, not plumbing.
 */
import { subscribeSyncEvents } from "@agent-native/core/client/use-db-sync";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useLocation, useSearchParams } from "react-router";

import {
  invalidateAnalytics,
  invalidateCycle,
  invalidateInbox,
  invalidateIssue,
  invalidateIssueLists,
  invalidateLinks,
  invalidateProject,
  invalidateSavedViews,
  invalidateTemplates,
  invalidateWorkspace,
} from "@/lib/query-keys";
import {
  parseBeamEvent,
  realtimeVerdict,
  reconnectTargets,
  type BeamChangeEvent,
  type ReconnectTarget,
} from "@/lib/realtime-events";
import { TAB_ID } from "@/lib/tab-id";
import { OVERLAY_PARAM } from "@/lib/view-url";

/**
 * How long after a local write this tab keeps ignoring events for that entity.
 * Long enough to cover the round trip that produced them, short enough that a
 * genuine remote change lands promptly.
 */
const ECHO_WINDOW_MS = 2000;

const pending = new Map<string, number>();
const versions = new Map<string, number>();

/**
 * Called by the mutation hooks before they write. The matching server event
 * is this tab's own echo: the optimistic patch already says the same thing,
 * and refetching under it is what causes the flicker.
 */
export function markLocalWrite(entityId: string | undefined): void {
  if (!entityId) return;
  pending.set(entityId, Date.now() + ECHO_WINDOW_MS);
}

/** Records the authoritative version a write returned, for ordering. */
export function noteEntityVersion(entityId: string, version: number): void {
  const known = versions.get(entityId);
  if (known === undefined || version > known) versions.set(entityId, version);
}

/** @internal test seam */
export function _resetRealtimeState(): void {
  pending.clear();
  versions.clear();
}

export function BeamRealtime() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  // The subscription must not be torn down and rebuilt on every navigation,
  // so the handlers read the current route through a ref instead.
  const route = useRef({ pathname: location.pathname, openIssue: false });
  route.current = {
    pathname: location.pathname,
    openIssue: Boolean(searchParams.get(OVERLAY_PARAM)),
  };

  useEffect(() => {
    let connected = true;

    function applyEvent(event: BeamChangeEvent) {
      switch (event.entity) {
        case "issue":
          invalidateIssueLists(queryClient);
          invalidateIssue(queryClient);
          // A moved issue changes project and cycle completion, and the
          // grouped SQL helpers recompute those far more cheaply than the
          // client could track them.
          if (event.projectId) invalidateProject(queryClient);
          if (event.cycleId) invalidateCycle(queryClient);
          if (event.triage) invalidateWorkspace(queryClient);
          // Any issue write can move a throughput figure, and an analytics
          // surface is only ever mounted one at a time.
          invalidateAnalytics(queryClient);
          if (event.issueVersion !== undefined && event.id) {
            noteEntityVersion(event.id, event.issueVersion);
          }
          break;
        case "comment":
          invalidateIssue(queryClient);
          break;
        case "notification":
          invalidateInbox(queryClient);
          break;
        case "project":
          invalidateProject(queryClient);
          break;
        case "cycle":
          invalidateCycle(queryClient);
          invalidateIssueLists(queryClient);
          break;
        case "view":
          invalidateSavedViews(queryClient);
          break;
        case "template":
          invalidateTemplates(queryClient);
          break;
        case "link":
          invalidateLinks(queryClient, event.linkEntity);
          break;
      }
    }

    function refresh(targets: ReconnectTarget[]) {
      for (const target of targets) {
        if (target === "issueLists") invalidateIssueLists(queryClient);
        if (target === "issueDetail") invalidateIssue(queryClient);
        if (target === "inbox") invalidateInbox(queryClient);
        if (target === "project") invalidateProject(queryClient);
        if (target === "cycle") invalidateCycle(queryClient);
        if (target === "workspace") invalidateWorkspace(queryClient);
      }
    }

    const unsubscribe = subscribeSyncEvents({
      onEvents: (events) => {
        const now = Date.now();
        for (const raw of events) {
          const event = parseBeamEvent(raw);
          if (!event) continue;
          const verdict = realtimeVerdict(event, {
            tabId: TAB_ID,
            pending,
            versions,
            now,
          });
          if (verdict === "apply") applyEvent(event);
        }
      },
      onSseStateChange: (isConnected) => {
        // Events during the gap are gone — nothing replays them — so a
        // reconnect refetches what the user can actually see.
        if (isConnected && !connected) {
          refresh(
            reconnectTargets(route.current.pathname, route.current.openIssue),
          );
        }
        connected = isConnected;
      },
    });

    return unsubscribe;
  }, [queryClient]);

  return null;
}
