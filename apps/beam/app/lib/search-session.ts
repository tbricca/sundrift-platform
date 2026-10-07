/**
 * Two short-lived pieces of search state.
 *
 * Both are deliberately session-scoped. The last query lives in
 * `sessionStorage` so reopening search in the same tab resumes where you left
 * off, and a new browser session starts blank — search terms are not history
 * and never reach the database or long-term storage.
 */

const QUERY_KEY = "beam:search-query";

export function readSessionQuery(): string {
  if (typeof sessionStorage === "undefined") return "";
  try {
    return sessionStorage.getItem(QUERY_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeSessionQuery(query: string): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    if (query) sessionStorage.setItem(QUERY_KEY, query);
    else sessionStorage.removeItem(QUERY_KEY);
  } catch {
    // Storage being unavailable is not worth interrupting a search for.
  }
}

/**
 * Where the last opened search result lives, so a property flow started
 * straight afterwards offers the right team's statuses and cycles.
 *
 * Held in memory only, and cleared as soon as it is used or the user moves on
 * — a stale "last search team" silently scoping later edits would be worse
 * than having no context at all.
 */
export type SearchScope = {
  teamKey?: string;
  projectId?: string;
  cycleId?: string;
};

let scope: SearchScope | null = null;

export function publishSearchScope(next: SearchScope | null): void {
  scope = next;
}

export function readSearchScope(): SearchScope | null {
  return scope;
}
