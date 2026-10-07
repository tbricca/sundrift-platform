/**
 * Mirrors the other agent-context helpers: the triage queue publishes what the
 * reviewer is looking at so `view-screen` can describe it. Agents still have
 * to call `update-issue-triage` explicitly to review anything.
 */
import type { TriageScope } from "./issue-query";

export type PublishedTriage = {
  scope: TriageScope;
  pendingCount: number;
  focusedIssue: string | null;
};

let current: PublishedTriage | null = null;

export function publishTriageContext(state: PublishedTriage | null): void {
  current = state;
}

export function readTriageContext(): PublishedTriage | null {
  return current;
}
