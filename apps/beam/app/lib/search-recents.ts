/**
 * Recently opened records, kept in localStorage.
 *
 * Deliberately not a database model: this is a convenience for one browser,
 * not workspace history, and search queries themselves are never stored.
 */

const KEY = "beam:recent-items";
const LIMIT = 8;

export type RecentKind = "issue" | "project" | "cycle" | "view";

export type RecentItem = {
  kind: RecentKind;
  /** Stable key for dedupe: the identifier for issues, the id otherwise. */
  id: string;
  label: string;
  meta: string | null;
  href: string;
};

function read(): RecentItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? (parsed as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function recentItems(): RecentItem[] {
  return read();
}

export function rememberRecent(item: RecentItem): void {
  if (typeof localStorage === "undefined") return;
  const next = [item, ...read().filter((entry) => entry.id !== item.id)].slice(
    0,
    LIMIT,
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // A full or blocked storage is not worth interrupting navigation for.
  }
}
