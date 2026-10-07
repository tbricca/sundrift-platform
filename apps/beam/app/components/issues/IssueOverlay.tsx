import { useCallback } from "react";
import { useSearchParams } from "react-router";

import {
  SHORTCUT_PRIORITY,
  hasOpenPopover,
  useShortcuts,
} from "@/hooks/use-shortcuts";
import { keys as shortcutKeys } from "@/lib/shortcuts";

import { IssueDetail } from "./IssueDetail";

const PARAM = "issue";

/**
 * The overlay is addressed with `?issue=ENG-16` on top of whatever list or
 * board is underneath. That keeps the underlying view mounted (team, layout,
 * filters, grouping, ordering and scroll all survive), makes the issue
 * deep-linkable, and gives Back its natural meaning as "close" because the
 * open is a real history entry.
 */
export function useIssueOverlay() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeIdentifier = searchParams.get(PARAM);

  const openIssue = useCallback(
    (identifier: string) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          next.set(PARAM, identifier);
          return next;
        },
        { preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  const closeIssue = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(PARAM);
        return next;
      },
      { preventScrollReset: true, replace: false },
    );
  }, [setSearchParams]);

  return { activeIdentifier, openIssue, closeIssue };
}

export function IssueOverlay() {
  const { activeIdentifier, closeIssue } = useIssueOverlay();

  useShortcuts(
    {
      [shortcutKeys("nav.escape")]: () => {
        // A picker inside the pane owns Escape first.
        if (hasOpenPopover()) return false;
        closeIssue();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.overlay, enabled: Boolean(activeIdentifier) },
  );

  if (!activeIdentifier) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Close issue"
        tabIndex={-1}
        onClick={closeIssue}
        className="absolute inset-0 z-20 cursor-default bg-foreground/5 md:bg-transparent"
      />
      <aside
        role="dialog"
        aria-label={`Issue ${activeIdentifier}`}
        className="absolute inset-y-0 end-0 z-30 flex w-full min-w-0 flex-col border-s border-border bg-background shadow-[-8px_0_24px_rgba(16,18,32,0.08)] md:w-[min(680px,68%)]"
      >
        <IssueDetail
          identifier={activeIdentifier}
          variant="overlay"
          onClose={closeIssue}
        />
      </aside>
    </>
  );
}
