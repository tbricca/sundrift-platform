/**
 * Mirrors the selection/project/cycle context helpers: the Inbox publishes
 * what the user is looking at so `view-screen` can describe it. Nothing here
 * acts on notifications — the agent still has to call an action explicitly.
 */
export type PublishedInbox = {
  filter: "all" | "unread" | "mentions";
  unreadCount: number;
  focusedId: string | null;
};

let current: PublishedInbox | null = null;

export function publishInboxContext(state: PublishedInbox | null): void {
  current = state;
}

export function readInboxContext(): PublishedInbox | null {
  return current;
}
