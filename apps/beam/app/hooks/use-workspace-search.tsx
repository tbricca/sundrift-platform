/**
 * Debounced read path for global search.
 *
 * The debounce lives here rather than in the component so the query key only
 * changes once per pause: React Query then caches each distinct term and
 * re-showing an earlier query is instant.
 */
import { useActionQuery } from "@agent-native/core/client/hooks";
import { useEffect, useState } from "react";

import type { WorkspaceSearchResults } from "@/lib/types";

const DEBOUNCE_MS = 140;

const EMPTY: WorkspaceSearchResults = {
  query: "",
  issues: [],
  projects: [],
  cycles: [],
  views: [],
  members: [],
};

export function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useWorkspaceSearch(rawQuery: string): {
  results: WorkspaceSearchResults;
  isLoading: boolean;
  /** True while the user has typed past what the server has answered. */
  isStale: boolean;
} {
  const query = rawQuery.trim();
  const debounced = useDebounced(query);

  const { data, isFetching } = useActionQuery<WorkspaceSearchResults>(
    "search-workspace",
    { query: debounced },
    // An empty box has nothing to ask the server about.
    { enabled: debounced.length > 0 },
  );

  return {
    results: debounced && data ? data : EMPTY,
    isLoading: isFetching,
    isStale: query !== debounced,
  };
}
