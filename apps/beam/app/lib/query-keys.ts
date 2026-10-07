/**
 * Every action-query key in Beam, in one place.
 *
 * Realtime handlers and mutation hooks call these helpers instead of writing
 * `["action", "list-issues"]` inline, so adding a read action means editing one
 * file rather than grepping for string literals across the app.
 */
import type { QueryClient } from "@tanstack/react-query";

/** The framework keys every action query as `["action", name, params]`. */
export const KEYS = {
  workspace: ["action", "get-workspace"],
  issueLists: ["action", "list-issues"],
  issueDetail: ["action", "get-issue"],
  notifications: ["action", "list-notifications"],
  projects: ["action", "list-projects"],
  projectDetail: ["action", "get-project"],
  cycles: ["action", "list-cycles"],
  cycleDetail: ["action", "get-cycle"],
  savedViews: ["action", "list-saved-views"],
  search: ["action", "search-workspace"],
  templates: ["action", "list-issue-templates"],
  links: ["action", "list-entity-links"],
  recurring: ["action", "list-recurring-issues"],
  recurringDetail: ["action", "get-recurring-issue"],
  teamAnalytics: ["action", "get-team-analytics"],
  cycleAnalytics: ["action", "get-cycle-analytics"],
  projectAnalytics: ["action", "get-project-analytics"],
} as const;

function invalidate(
  queryClient: QueryClient,
  ...keys: readonly (readonly unknown[])[]
) {
  for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
}

/**
 * One issue changed. Detail queries are keyed by identifier, so the whole
 * `get-issue` family is invalidated and React Query refetches only the ones
 * currently mounted.
 */
export function invalidateIssue(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.issueDetail);
}

export function invalidateIssueLists(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.issueLists);
}

/** Inbox list and the sidebar badge share this key. */
export function invalidateInbox(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.notifications);
}

export function invalidateProject(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.projectDetail, KEYS.projects, KEYS.projectAnalytics);
}

export function invalidateCycle(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.cycleDetail, KEYS.cycles, KEYS.cycleAnalytics);
}

/**
 * Analytics are aggregates, so almost any issue write can move one. They are
 * cheap to refetch and nobody is watching a chart for sub-second updates, so
 * this rides along with the existing invalidation rather than patching caches.
 */
export function invalidateAnalytics(queryClient: QueryClient) {
  invalidate(
    queryClient,
    KEYS.teamAnalytics,
    KEYS.cycleAnalytics,
    KEYS.projectAnalytics,
  );
}

export function invalidateSavedViews(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.savedViews);
}

export function invalidateTemplates(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.templates);
}

/**
 * A rule changed, or fired. Issue lists go too, because a rule that runs
 * produces an ordinary issue that belongs in them.
 */
export function invalidateRecurring(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.recurring, KEYS.recurringDetail);
  invalidateIssueLists(queryClient);
}

/**
 * Links are read through their own action but rendered inside a detail view,
 * so the surface they belong to refreshes with them.
 */
export function invalidateLinks(
  queryClient: QueryClient,
  entityType?: "issue" | "project",
) {
  invalidate(queryClient, KEYS.links);
  if (entityType === "issue") invalidateIssue(queryClient);
  if (entityType === "project") invalidateProject(queryClient);
}

/**
 * Triage counts and team settings ride the workspace bootstrap, so an issue
 * entering or leaving triage has to refresh it.
 */
export function invalidateWorkspace(queryClient: QueryClient) {
  invalidate(queryClient, KEYS.workspace);
}
