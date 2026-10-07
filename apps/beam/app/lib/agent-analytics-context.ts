/**
 * What the analytics page is currently showing, for `view-screen`.
 *
 * The route path carries only a team key, and the range lives in a query
 * parameter, so neither says what the numbers actually are. Publishing the
 * headline figures lets an agent answer "how did we do this month" from the
 * screen the user is looking at instead of re-deriving it.
 *
 * Deliberately compact: four numbers and the window, not the trend series.
 */
export type PublishedAnalytics = {
  teamKey: string;
  range: string;
  window: { start: string; end: string };
  created: number;
  completed: number;
  canceled: number;
  completionRate: number | null;
  medianCompletionSeconds: number | null;
};

let published: PublishedAnalytics | null = null;

export function publishAnalyticsContext(
  analytics: PublishedAnalytics | null,
): void {
  published = analytics;
}

/** Scoped by team so a stale publish from another team is never reported. */
export function readAnalyticsContext(
  teamKey: string,
): PublishedAnalytics | null {
  return published?.teamKey === teamKey ? published : null;
}
