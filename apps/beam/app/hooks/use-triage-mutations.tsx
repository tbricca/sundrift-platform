/**
 * Review writes for the triage queue.
 *
 * Every call goes through the one `update-issue-triage` action, which itself
 * delegates ordinary field changes to `update-issue` — so validation,
 * activity and assignment notifications are the normal ones. Here we only do
 * the optimistic bit: drop the reviewed row out of the current queue, then
 * reconcile.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { markLocalWrite } from "@/hooks/use-beam-realtime";
import { patchIssueCaches } from "@/hooks/use-issue-mutations";
import type { IssueListItem } from "@/lib/types";

export type AcceptOptions = {
  statusId?: string;
  assigneeId?: string | null;
  priority?: IssueListItem["priority"];
  projectId?: string | null;
  cycleId?: string | null;
};

type TriageArgs = AcceptOptions & {
  action: "accept" | "decline" | "snooze";
  snoozedUntil?: string;
  reason?: string;
};

export function useTriageMutations() {
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["action", "list-issues"] });
    void queryClient.invalidateQueries({ queryKey: ["action", "get-issue"] });
    // The sidebar pending count is part of the workspace bootstrap.
    void queryClient.invalidateQueries({
      queryKey: ["action", "get-workspace"],
    });
  }, [queryClient]);

  const review = useCallback(
    async (issue: IssueListItem, args: TriageArgs, successMessage: string) => {
      const before = queryClient.getQueriesData({ queryKey: ["action"] });
      markLocalWrite(issue.id);
      // The row leaves whichever triage tab it is currently in.
      patchIssueCaches(queryClient, issue.id, () => null);

      try {
        await callAction(
          "update-issue-triage",
          { identifier: issue.identifier, ...args },
          { method: "PUT" },
        );
        toast.success(successMessage);
        refresh();
      } catch (error) {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not review that issue.",
        );
      }
    },
    [queryClient, refresh],
  );

  const accept = useCallback(
    (issue: IssueListItem, options: AcceptOptions = {}) =>
      review(
        issue,
        { action: "accept", ...options },
        `${issue.identifier} accepted`,
      ),
    [review],
  );

  const decline = useCallback(
    (issue: IssueListItem, reason?: string) =>
      review(
        issue,
        { action: "decline", reason: reason?.trim() || undefined },
        `${issue.identifier} declined`,
      ),
    [review],
  );

  const snooze = useCallback(
    (issue: IssueListItem, until: Date) =>
      review(
        issue,
        { action: "snooze", snoozedUntil: until.toISOString() },
        `${issue.identifier} snoozed`,
      ),
    [review],
  );

  /**
   * Review a whole selection through the bulk action, which loops the same
   * single-issue path server-side.
   *
   * Deliberately no Undo. Accept and Decline are review decisions, not
   * property edits: "undoing" an accept would have to guess whether the issue
   * should return to Pending and what its status was beforehand. The
   * confirmation is the toast, and a mistaken decision is fixed by editing the
   * issue, which leaves an honest activity trail.
   */
  const reviewMany = useCallback(
    async (issues: IssueListItem[], args: TriageArgs, verb: string) => {
      if (issues.length === 0) return;
      const before = queryClient.getQueriesData({ queryKey: ["action"] });
      for (const issue of issues) {
        markLocalWrite(issue.id);
        patchIssueCaches(queryClient, issue.id, () => null);
      }

      try {
        const result = await callAction<{
          reviewedCount: number;
          failed: { identifier: string; error: string }[];
        }>(
          "bulk-update-issue-triage",
          { issueIds: issues.map((issue) => issue.id), ...args },
          { method: "PUT" },
        );

        if (result.failed.length) {
          // Successful reviews stand; the operation is not atomic. Restoring
          // everything would be a lie about what the server did, so the queue
          // is refetched instead and the failures are named.
          toast.error(
            `${result.failed.length} of ${issues.length} could not be ${verb}`,
            { description: result.failed[0].error },
          );
        } else {
          toast.success(`${result.reviewedCount} issues ${verb}`);
        }
        refresh();
      } catch (error) {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error ? error.message : "Could not review those.",
        );
      }
    },
    [queryClient, refresh],
  );

  const acceptMany = useCallback(
    (issues: IssueListItem[], options: AcceptOptions = {}) =>
      reviewMany(issues, { action: "accept", ...options }, "accepted"),
    [reviewMany],
  );

  const declineMany = useCallback(
    (issues: IssueListItem[], reason?: string) =>
      reviewMany(
        issues,
        { action: "decline", reason: reason?.trim() || undefined },
        "declined",
      ),
    [reviewMany],
  );

  const snoozeMany = useCallback(
    (issues: IssueListItem[], until: Date) =>
      reviewMany(
        issues,
        { action: "snooze", snoozedUntil: until.toISOString() },
        "snoozed",
      ),
    [reviewMany],
  );

  return { accept, decline, snooze, acceptMany, declineMany, snoozeMany };
}

/** Snooze presets, resolved at click time so "tomorrow" is always tomorrow. */
export function snoozePresets(): { label: string; value: () => Date }[] {
  const atNineAm = (days: number) => () => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    date.setHours(9, 0, 0, 0);
    return date;
  };
  return [
    { label: "Later today", value: () => new Date(Date.now() + 4 * 3600_000) },
    { label: "Tomorrow", value: atNineAm(1) },
    { label: "Next week", value: atNineAm(7) },
  ];
}
