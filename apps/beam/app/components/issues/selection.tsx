/**
 * Focus and multi-selection for every issue surface.
 *
 * The state lives here rather than on rows so that the bulk bar, the command
 * palette and the keyboard layer all read one source of truth. The renderer
 * publishes the flat display order via `setOrdered`, which is what makes
 * range-select and J/K work across group boundaries.
 *
 * Selection is intentionally not URL-backed: it is a transient interaction
 * state, not part of a shareable view.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { IssueListItem } from "@/lib/types";

export type SelectionState = {
  ordered: IssueListItem[];
  selectedIds: string[];
  selected: IssueListItem[];
  focusedId: string | null;
  isSelected: (id: string) => boolean;
  setOrdered: (issues: IssueListItem[]) => void;
  focus: (id: string | null) => void;
  /** Moves focus by `delta` rows, optionally extending the selection. */
  move: (delta: number, extend?: boolean) => boolean;
  toggle: (id: string) => void;
  /** Shift-click: selects everything between the anchor and `id`. */
  selectRange: (id: string) => void;
  selectAll: () => void;
  clear: () => void;
  /** Drops ids that are no longer in the view, e.g. after a bulk move. */
  reconcile: (options?: { clearAll?: boolean }) => void;
};

const SelectionContext = createContext<SelectionState | null>(null);

export function IssueSelectionProvider({ children }: { children: ReactNode }) {
  const [ordered, setOrderedState] = useState<IssueListItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Refs keep the shortcut handlers stable without re-registering every render.
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const focusedRef = useRef(focusedId);
  focusedRef.current = focusedId;
  const anchorRef = useRef<string | null>(null);

  const setOrdered = useCallback((issues: IssueListItem[]) => {
    setOrderedState((current) => {
      if (
        current.length === issues.length &&
        current.every((issue, index) => issue === issues[index])
      ) {
        return current;
      }
      return issues;
    });
  }, []);

  // A row that scrolled out of the query can no longer be focused or selected.
  useEffect(() => {
    const present = new Set(ordered.map((issue) => issue.id));
    setSelectedIds((current) => {
      const next = current.filter((id) => present.has(id));
      return next.length === current.length ? current : next;
    });
    setFocusedId((current) =>
      current && !present.has(current) ? null : current,
    );
  }, [ordered]);

  const focus = useCallback((id: string | null) => {
    setFocusedId(id);
    anchorRef.current = id;
  }, []);

  const scrollTo = (id: string) => {
    document
      .querySelector(`[data-issue-id="${id}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const move = useCallback((delta: number, extend = false) => {
    const list = orderedRef.current;
    if (list.length === 0) return true;
    const current = list.findIndex((issue) => issue.id === focusedRef.current);
    const nextIndex =
      current === -1
        ? delta > 0
          ? 0
          : list.length - 1
        : Math.min(Math.max(current + delta, 0), list.length - 1);
    const next = list[nextIndex];

    setFocusedId(next.id);
    if (extend) {
      // Shift+J/K grows the selection over the row it lands on.
      setSelectedIds((ids) =>
        ids.includes(next.id) ? ids : [...ids, next.id],
      );
      if (current !== -1) {
        const from = list[current];
        setSelectedIds((ids) =>
          ids.includes(from.id) ? ids : [...ids, from.id],
        );
      }
    } else {
      anchorRef.current = next.id;
    }
    scrollTo(next.id);
    return true;
  }, []);

  const toggle = useCallback((id: string) => {
    anchorRef.current = id;
    setSelectedIds((ids) =>
      ids.includes(id) ? ids.filter((entry) => entry !== id) : [...ids, id],
    );
  }, []);

  const selectRange = useCallback((id: string) => {
    const list = orderedRef.current;
    const anchor = anchorRef.current ?? focusedRef.current;
    const to = list.findIndex((issue) => issue.id === id);
    const from = anchor
      ? list.findIndex((issue) => issue.id === anchor)
      : -1;
    if (to === -1) return;
    if (from === -1) {
      setSelectedIds([id]);
      anchorRef.current = id;
      return;
    }
    const [start, end] = from <= to ? [from, to] : [to, from];
    const range = list.slice(start, end + 1).map((issue) => issue.id);
    setSelectedIds((ids) => [...new Set([...ids, ...range])]);
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(orderedRef.current.map((issue) => issue.id));
  }, []);

  const clear = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const reconcile = useCallback((options: { clearAll?: boolean } = {}) => {
    if (options.clearAll) {
      setSelectedIds([]);
      return;
    }
    const present = new Set(orderedRef.current.map((issue) => issue.id));
    setSelectedIds((ids) => ids.filter((id) => present.has(id)));
  }, []);

  const value = useMemo<SelectionState>(() => {
    const selectedSet = new Set(selectedIds);
    return {
      ordered,
      selectedIds,
      selected: ordered.filter((issue) => selectedSet.has(issue.id)),
      focusedId,
      isSelected: (id) => selectedSet.has(id),
      setOrdered,
      focus,
      move,
      toggle,
      selectRange,
      selectAll,
      clear,
      reconcile,
    };
  }, [
    ordered,
    selectedIds,
    focusedId,
    setOrdered,
    focus,
    move,
    toggle,
    selectRange,
    selectAll,
    clear,
    reconcile,
  ]);

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/** Null outside an issue surface, e.g. when the palette opens on a settings page. */
export function useIssueSelectionOptional(): SelectionState | null {
  return useContext(SelectionContext);
}

export function useIssueSelection(): SelectionState {
  const value = useContext(SelectionContext);
  if (!value) {
    throw new Error("useIssueSelection must be used inside an issue surface.");
  }
  return value;
}
