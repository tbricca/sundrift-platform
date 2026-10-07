/**
 * Selection is client-only interaction state, so the agent cannot see it
 * unless the UI publishes it. `view-screen` reports what the user has selected
 * and focused; acting on it still requires an explicit bulk-update-issues call
 * with the ids.
 */
export type PublishedSelection = {
  selectedIssueIds: string[];
  selectedCount: number;
  focusedIssue: string | null;
};

let published: PublishedSelection | null = null;

export function publishSelectionContext(
  selection: PublishedSelection | null,
): void {
  published = selection;
}

export function readSelectionContext(): PublishedSelection | null {
  if (!published) return null;
  return published.selectedCount === 0 && !published.focusedIssue
    ? null
    : published;
}
