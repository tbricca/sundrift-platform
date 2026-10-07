/**
 * Every issue write in the app goes through here so optimistic behaviour,
 * rollback and conflict reporting are identical on the list, the board and the
 * detail pane. Simple property edits patch the caches in place and skip the
 * framework's blanket `["action"]` invalidation, which is what keeps long lists
 * from refetching after a single dropdown change.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import { markLocalWrite, noteEntityVersion } from "@/hooks/use-beam-realtime";
import {
  PROPERTY_DEFS,
  propertyPatch,
  type PropertyContext,
  type PropertyId,
  type PropertyValue,
} from "@/components/issues/properties";
import type {
  IssueDetail,
  IssueGroupResult,
  IssueListItem,
} from "@/lib/types";

type ListResult = {
  query: { grouping: string };
  groups: IssueGroupResult[];
  total: number;
};

function isListResult(data: unknown): data is ListResult {
  return Boolean(data && typeof data === "object" && "groups" in data);
}

function isDetail(data: unknown): data is IssueDetail {
  return Boolean(data && typeof data === "object" && "comments" in data);
}

/** Applies a property change to a cached row so the UI updates instantly. */
export function applyProperty(
  issue: IssueListItem,
  property: PropertyId,
  value: PropertyValue,
  ctx: PropertyContext,
): IssueListItem {
  const next = { ...issue };
  switch (property) {
    case "status": {
      const status = (ctx.team?.statuses ?? []).find(
        (entry) => entry.id === value,
      );
      if (status) next.status = status;
      break;
    }
    case "priority":
      next.priority = value as IssueListItem["priority"];
      break;
    case "assignee":
      next.assignee =
        (ctx.workspace?.members ?? []).find((entry) => entry.id === value) ??
        null;
      break;
    case "project": {
      const project = (ctx.workspace?.projects ?? []).find(
        (entry) => entry.id === value,
      );
      next.project = project ? { id: project.id, name: project.name } : null;
      break;
    }
    case "cycle": {
      const cycle = (ctx.team?.cycles ?? []).find((entry) => entry.id === value);
      next.cycle = cycle
        ? { id: cycle.id, number: cycle.number, name: cycle.name }
        : null;
      break;
    }
    case "labels": {
      const ids = (value as string[]) ?? [];
      next.labels = (ctx.workspace?.labels ?? [])
        .filter((label) => ids.includes(label.id))
        .map((label) => ({
          id: label.id,
          name: label.name,
          color: label.color,
        }));
      break;
    }
    case "dueDate":
      next.dueDate = (value as string | null) ?? null;
      break;
    case "estimate":
      next.estimate = value === null ? null : Number(value);
      break;
    case "milestone":
      break;
  }
  return next;
}

/** Exported so bulk edits patch rows exactly as single edits do. */
export function patchIssueCaches(
  queryClient: QueryClient,
  issueId: string,
  update: (issue: IssueListItem) => IssueListItem | null,
  options: { regroupStatusId?: string } = {},
) {
  queryClient.setQueriesData<ListResult | undefined>(
    { queryKey: ["action", "list-issues"] },
    (data) => {
      if (!isListResult(data)) return data;

      let moved: IssueListItem | null = null;
      let changed = false;

      const groups = data.groups.map((group) => {
        const index = group.issues.findIndex((issue) => issue.id === issueId);
        if (index === -1) return group;
        changed = true;
        const nextIssue = update(group.issues[index]);
        const removeFromGroup =
          nextIssue === null ||
          (options.regroupStatusId !== undefined &&
            data.query.grouping === "status" &&
            group.key !== options.regroupStatusId);

        if (!removeFromGroup) {
          const issues = [...group.issues];
          issues[index] = nextIssue!;
          return { ...group, issues };
        }

        if (nextIssue) moved = nextIssue;
        const issues = group.issues.filter((issue) => issue.id !== issueId);
        return { ...group, issues, count: issues.length };
      });

      if (!changed) return data;

      const withMove = moved
        ? groups.map((group) =>
            group.key === options.regroupStatusId
              ? {
                  ...group,
                  issues: [moved as IssueListItem, ...group.issues],
                  count: group.issues.length + 1,
                }
              : group,
          )
        : groups;

      const total = withMove.reduce(
        (sum, group) => sum + group.issues.length,
        0,
      );
      return { ...data, groups: withMove, total };
    },
  );
}

function patchDetailCaches(
  queryClient: QueryClient,
  issueId: string,
  update: (issue: IssueDetail) => IssueDetail,
) {
  queryClient.setQueriesData<unknown>(
    { queryKey: ["action", "get-issue"] },
    (data: unknown) =>
      isDetail(data) && data.id === issueId ? update(data) : data,
  );
}

export function useIssueMutations() {
  const queryClient = useQueryClient();

  const invalidateIssues = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["action", "list-issues"] });
    void queryClient.invalidateQueries({ queryKey: ["action", "get-issue"] });
  }, [queryClient]);

  /**
   * Optimistically applies a single property change, then reconciles. On
   * failure the previous cache snapshot is restored and the reason surfaced.
   */
  const updateProperty = useCallback(
    async (
      issue: IssueListItem | IssueDetail,
      property: PropertyId,
      value: PropertyValue,
      ctx: PropertyContext,
    ) => {
      const before = queryClient.getQueriesData({ queryKey: ["action"] });
      const patch = propertyPatch(property, value);
      const regroupStatusId =
        property === "status" ? (value as string) : undefined;

      markLocalWrite(issue.id);
      patchIssueCaches(
        queryClient,
        issue.id,
        (row) => applyProperty(row, property, value, ctx),
        { regroupStatusId },
      );
      patchDetailCaches(queryClient, issue.id, (detail) => ({
        ...detail,
        ...applyProperty(detail, property, value, ctx),
        milestone:
          property === "milestone"
            ? ((ctx.workspace?.projects ?? [])
                .flatMap((project) => project.milestones)
                .find((entry) => entry.id === value) ?? null)
            : detail.milestone,
      }));

      try {
        const result = (await callAction(
          "update-issue",
          {
            identifier: issue.identifier,
            expectedVersion: issue.version,
            ...patch,
          },
          { method: "PUT" },
        )) as { version?: number } | undefined;
        // Remember the version this write produced so a late event carrying
        // an older one cannot roll the issue backwards.
        if (typeof result?.version === "number") {
          noteEntityVersion(issue.id, result.version);
        }
        // The detail pane needs the fresh activity row; lists already match.
        void queryClient.invalidateQueries({
          queryKey: ["action", "get-issue"],
        });
      } catch (error) {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        const message =
          error instanceof Error ? error.message : "Could not save that change.";
        toast.error(`${PROPERTY_DEFS[property].label} not saved`, {
          description: message,
        });
      }
    },
    [queryClient],
  );

  /** Soft delete with a compensating restore behind an Undo toast. */
  const deleteIssue = useCallback(
    async (issue: IssueListItem) => {
      const before = queryClient.getQueriesData({ queryKey: ["action"] });
      markLocalWrite(issue.id);
      patchIssueCaches(queryClient, issue.id, () => null);

      try {
        await callAction(
          "update-issue",
          { identifier: issue.identifier, deleted: true },
          { method: "PUT" },
        );
        toast(`${issue.identifier} deleted`, {
          action: {
            label: "Undo",
            onClick: () => {
              void callAction(
                "update-issue",
                { identifier: issue.identifier, deleted: false },
                { method: "PUT" },
              )
                .then(() => invalidateIssues())
                .catch(() => toast.error("Could not restore that issue."));
            },
          },
        });
      } catch (error) {
        for (const [key, data] of before) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error ? error.message : "Could not delete that issue.",
        );
      }
    },
    [invalidateIssues, queryClient],
  );

  /** Manual reorder: fractional sort_order between the two neighbours. */
  const reorderIssue = useCallback(
    async (
      issue: IssueListItem,
      before: IssueListItem | null,
      after: IssueListItem | null,
      statusId?: string,
    ) => {
      const low = before?.sortOrder ?? (after ? after.sortOrder - 2000 : 0);
      const high = after?.sortOrder ?? (before ? before.sortOrder + 2000 : 0);
      const sortOrder = (low + high) / 2;

      const snapshot = queryClient.getQueriesData({ queryKey: ["action"] });
      markLocalWrite(issue.id);
      try {
        await callAction(
          "update-issue",
          {
            identifier: issue.identifier,
            sortOrder,
            ...(statusId && statusId !== issue.status.id ? { statusId } : {}),
          },
          { method: "PUT" },
        );
        invalidateIssues();
      } catch (error) {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error ? error.message : "Could not move that issue.",
        );
      }
    },
    [invalidateIssues, queryClient],
  );

  return { updateProperty, deleteIssue, reorderIssue, invalidateIssues };
}
