/**
 * What global search is currently showing, for `view-screen`.
 *
 * Counts and the focused row only — the agent can re-run `search-workspace`
 * itself if it wants the payload, so mirroring it here would just be stale.
 */
export type PublishedSearch = {
  query: string;
  focusedResult: string | null;
  counts: Record<string, number>;
};

let current: PublishedSearch | null = null;

export function publishSearchContext(state: PublishedSearch | null): void {
  current = state;
}

export function readSearchContext(): PublishedSearch | null {
  return current;
}
