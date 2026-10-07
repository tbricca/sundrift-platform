/**
 * Bulk edits reuse everything the single-issue path already has: the property
 * registry builds the patch, `applyProperty` produces the optimistic row, and
 * the server runs each issue through `update-issue` itself. Nothing here knows
 * what a status or a cycle *means*.
 *
 * Undo is a single-step compensating write, not a history: before sending, we
 * record each issue's previous value for exactly the fields being changed, and
 * Undo replays those values back through the same bulk action.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import {
  PROPERTY_DEFS,
  propertyPatch,
  type PropertyContext,
  type PropertyId,
  type PropertyValue,
} from "@/components/issues/properties";
import { markLocalWrite } from "@/hooks/use-beam-realtime";
import { applyProperty, patchIssueCaches } from "@/hooks/use-issue-mutations";
import type { IssueListItem } from "@/lib/types";

export type BulkResult = {
  updated: string[];
  failed: { id: string; identifier: string; error: string }[];
  updatedCount: number;
};

type LabelDirection = "add" | "remove";

function plural(count: number): string {
  return count === 1 ? "1 issue" : `${count} issues`;
}

/** Replays previous per-issue values through the same bulk endpoint. */
async function restore(
  entries: { id: string; patch: Record<string, unknown> }[],
) {
  for (const entry of entries) {
    await callAction(
      "bulk-update-issues",
      { issueIds: [entry.id], ...entry.patch },
      { method: "PUT" },
    );
  }
}

export function useBulkMutations() {
  const queryClient = useQueryClient();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["action", "list-issues"] });
    void queryClient.invalidateQueries({ queryKey: ["action", "get-issue"] });
  }, [queryClient]);

  const report = useCallback(
    (result: BulkResult, message: string, undo?: () => void) => {
      if (result.failed.length) {
        const first = result.failed[0];
        toast.error(
          result.updatedCount
            ? `${plural(result.updatedCount)} updated, ${result.failed.length} failed`
            : "No issues were updated",
          {
            description: `${first.identifier}: ${first.error}${
              result.failed.length > 1
                ? ` (and ${result.failed.length - 1} more)`
                : ""
            }`,
          },
        );
        return;
      }
      toast(
        message,
        undo ? { action: { label: "Undo", onClick: undo } } : undefined,
      );
    },
    [],
  );

  /**
   * Applies one property to many issues. `previous` is captured per issue so
   * Undo can put each one back where it was, not merely to a shared default.
   */
  const bulkProperty = useCallback(
    async (
      selected: IssueListItem[],
      property: PropertyId,
      value: PropertyValue,
      ctx: PropertyContext,
      options: { label?: string } = {},
    ) => {
      if (selected.length === 0) return;
      const def = PROPERTY_DEFS[property];
      const patch = propertyPatch(property, value);
      const previous = selected.map((issue) => ({
        id: issue.id,
        patch: propertyPatch(property, def.read(issue)),
      }));

      const snapshot = queryClient.getQueriesData({ queryKey: ["action"] });
      const regroupStatusId =
        property === "status" ? (value as string) : undefined;
      for (const issue of selected) {
        markLocalWrite(issue.id);
        patchIssueCaches(
          queryClient,
          issue.id,
          (row) => applyProperty(row, property, value, ctx),
          { regroupStatusId },
        );
      }

      try {
        const result = (await callAction(
          "bulk-update-issues",
          { issueIds: selected.map((issue) => issue.id), ...patch },
          { method: "PUT" },
        )) as BulkResult;

        if (result.failed.length) {
          for (const [key, data] of snapshot)
            queryClient.setQueryData(key, data);
          refresh();
        }
        report(
          result,
          options.label ??
            `${plural(result.updatedCount)} · ${def.label.toLowerCase()} updated`,
          () => {
            void restore(previous)
              .then(refresh)
              .catch(() => toast.error("Could not undo that change."));
          },
        );
        return result;
      } catch (error) {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update those issues.",
        );
      }
    },
    [queryClient, refresh, report],
  );

  /** Add or remove one label without disturbing the issues' other labels. */
  const bulkLabel = useCallback(
    async (
      selected: IssueListItem[],
      labelId: string,
      direction: LabelDirection,
      ctx: PropertyContext,
    ) => {
      if (selected.length === 0) return;
      const label = (ctx.workspace?.labels ?? []).find(
        (entry) => entry.id === labelId,
      );
      const snapshot = queryClient.getQueriesData({ queryKey: ["action"] });

      for (const issue of selected) {
        markLocalWrite(issue.id);
        patchIssueCaches(queryClient, issue.id, (row) => {
          const others = row.labels.filter((entry) => entry.id !== labelId);
          return {
            ...row,
            labels:
              direction === "add" && label
                ? [
                    ...others,
                    { id: label.id, name: label.name, color: label.color },
                  ]
                : others,
          };
        });
      }

      // Undo is the inverse operation, which is exactly as accurate here and
      // avoids replaying whole label sets.
      const key = direction === "add" ? "addLabelIds" : "removeLabelIds";
      const inverseKey = direction === "add" ? "removeLabelIds" : "addLabelIds";

      try {
        const result = (await callAction(
          "bulk-update-issues",
          { issueIds: selected.map((issue) => issue.id), [key]: [labelId] },
          { method: "PUT" },
        )) as BulkResult;

        if (result.failed.length) {
          for (const [entry, data] of snapshot)
            queryClient.setQueryData(entry, data);
          refresh();
        }
        report(
          result,
          `${label?.name ?? "Label"} ${direction === "add" ? "added to" : "removed from"} ${plural(result.updatedCount)}`,
          () => {
            void callAction(
              "bulk-update-issues",
              { issueIds: result.updated, [inverseKey]: [labelId] },
              { method: "PUT" },
            )
              .then(refresh)
              .catch(() => toast.error("Could not undo that change."));
          },
        );
        return result;
      } catch (error) {
        for (const [entry, data] of snapshot)
          queryClient.setQueryData(entry, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not update those labels.",
        );
      }
    },
    [queryClient, refresh, report],
  );

  /**
   * Current/next cycle resolves per issue on the server, so a selection
   * spanning teams lands each issue in its own team's cycle.
   */
  const bulkCycleTarget = useCallback(
    async (selected: IssueListItem[], cycleTarget: "current" | "next") => {
      if (selected.length === 0) return;
      const previous = selected.map((issue) => ({
        id: issue.id,
        patch: { cycleId: issue.cycle?.id ?? null },
      }));
      const snapshot = queryClient.getQueriesData({ queryKey: ["action"] });

      try {
        const result = (await callAction(
          "bulk-update-issues",
          { issueIds: selected.map((issue) => issue.id), cycleTarget },
          { method: "PUT" },
        )) as BulkResult;

        refresh();
        report(
          result,
          `${plural(result.updatedCount)} moved to the ${cycleTarget} cycle`,
          () => {
            void restore(previous)
              .then(refresh)
              .catch(() => toast.error("Could not undo that move."));
          },
        );
        return result;
      } catch (error) {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not move those issues.",
        );
      }
    },
    [queryClient, refresh, report],
  );

  /** Soft delete or archive, both reversible from the toast. */
  const bulkRemove = useCallback(
    async (selected: IssueListItem[], mode: "deleted" | "archived") => {
      if (selected.length === 0) return;
      const ids = selected.map((issue) => issue.id);
      const snapshot = queryClient.getQueriesData({ queryKey: ["action"] });
      for (const issue of selected) {
        markLocalWrite(issue.id);
        patchIssueCaches(queryClient, issue.id, () => null);
      }

      try {
        const result = (await callAction(
          "bulk-update-issues",
          { issueIds: ids, [mode]: true },
          { method: "PUT" },
        )) as BulkResult;

        if (result.failed.length) {
          for (const [key, data] of snapshot)
            queryClient.setQueryData(key, data);
          refresh();
        }
        report(
          result,
          `${plural(result.updatedCount)} ${mode === "deleted" ? "deleted" : "archived"}`,
          () => {
            void callAction(
              "bulk-update-issues",
              { issueIds: result.updated, [mode]: false },
              { method: "PUT" },
            )
              .then(refresh)
              .catch(() => toast.error("Could not restore those issues."));
          },
        );
        return result;
      } catch (error) {
        for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not remove those issues.",
        );
      }
    },
    [queryClient, refresh, report],
  );

  /**
   * The inverse of archiving. Unlike `bulkRemove` this does not drop the rows
   * optimistically: the user is looking at an archived view, and the issues
   * belong there until the refetch says otherwise.
   */
  const bulkUnarchive = useCallback(
    async (selected: IssueListItem[]) => {
      if (selected.length === 0) return;
      for (const issue of selected) markLocalWrite(issue.id);

      try {
        const result = (await callAction(
          "bulk-update-issues",
          { issueIds: selected.map((issue) => issue.id), archived: false },
          { method: "PUT" },
        )) as BulkResult;

        refresh();
        report(result, `${plural(result.updatedCount)} unarchived`);
        return result;
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not unarchive those issues.",
        );
      }
    },
    [refresh, report],
  );

  return {
    bulkProperty,
    bulkLabel,
    bulkCycleTarget,
    bulkRemove,
    bulkUnarchive,
    refresh,
  };
}
