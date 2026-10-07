import { useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconArchive,
  IconCheck,
  IconChevronRight,
  IconLayoutList,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useIssueMutations } from "@/hooks/use-issue-mutations";
import {
  SHORTCUT_PRIORITY,
  hasOpenPopover,
  useShortcuts,
} from "@/hooks/use-shortcuts";
import type { IssueGrouping, IssueQuery } from "@/lib/issue-query";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import type {
  IssueGroupResult,
  IssueListItem,
  WorkspaceBootstrap,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { openCommandPalette } from "@/components/command/CommandPalette";
import { IssueRowMenu } from "@/components/menus/IssueRowMenu";
import type { TriageAction } from "@/components/menus/IssueContextMenu";
import { publishSelectionContext } from "@/lib/agent-selection-context";

import { useIssueOverlay } from "./IssueOverlay";
import { useIssueSelection } from "./selection";
import {
  IssueProperty,
  type PropertyContext,
  type PropertyId,
  type WorkspaceTeam,
} from "./properties";
import { LabelChip, formatRelative, formatShortDate } from "./primitives";

type QueryResult = {
  query: IssueQuery;
  groups: IssueGroupResult[];
  total: number;
};

export function IssueViewEngine({
  query,
  workspace,
  team,
  emptyMessage = "No issues match this view.",
  onCreateIssue,
  rowActions,
  triage,
  onTriage,
}: {
  query: IssueQuery;
  workspace: WorkspaceBootstrap | null;
  team: WorkspaceTeam | null;
  emptyMessage?: string;
  onCreateIssue?: () => void;
  /** Trailing controls for a row, used by surfaces such as Triage. */
  rowActions?: (issue: IssueListItem) => React.ReactNode;
  /** Triage adds the review decisions to every row's context menu. */
  triage?: boolean;
  onTriage?: (action: TriageAction, issues: IssueListItem[]) => void;
}) {
  const params = useMemo(() => ({ query }), [query]);
  const { data, isLoading } = useActionQuery<QueryResult>(
    "list-issues",
    params,
  );
  const { updateProperty, deleteIssue, reorderIssue } = useIssueMutations();
  const { openIssue, activeIdentifier } = useIssueOverlay();

  const ctx: PropertyContext = useMemo(
    () => ({ workspace, team }),
    [workspace, team],
  );

  const visibleGroups = useMemo(() => data?.groups ?? [], [data]);

  // Flat display order drives J/K navigation across group boundaries.
  const ordered = useMemo(
    () => visibleGroups.flatMap((group) => group.issues),
    [visibleGroups],
  );

  const selection = useIssueSelection();
  const {
    focusedId,
    selectedIds,
    move,
    focus,
    toggle,
    selectRange,
    selectAll,
    clear,
    setOrdered,
  } = selection;

  // The renderer owns display order; the selection layer needs it for
  // range-select and J/K.
  useEffect(() => {
    setOrdered(ordered);
  }, [ordered, setOrdered]);

  // Let view-screen describe what the user has selected.
  useEffect(() => {
    const focused = ordered.find((issue) => issue.id === focusedId);
    publishSelectionContext({
      selectedIssueIds: selectedIds,
      selectedCount: selectedIds.length,
      focusedIssue: focused?.identifier ?? null,
    });
    return () => publishSelectionContext(null);
  }, [ordered, selectedIds, focusedId]);
  const focusedRef = useRef(focusedId);
  focusedRef.current = focusedId;
  const orderedRef = useRef(ordered);
  orderedRef.current = ordered;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;

  const toggleFocused = useCallback(() => {
    const issue = orderedRef.current.find(
      (entry) => entry.id === focusedRef.current,
    );
    if (!issue) return false;
    toggle(issue.id);
    return true;
  }, [toggle]);

  useShortcuts(
    {
      [shortcutKeys("nav.next")]: () => move(1),
      [shortcutKeys("nav.prev")]: () => move(-1),
      [shortcutKeys("select.extendDown")]: () => move(1, true),
      [shortcutKeys("select.extendUp")]: () => move(-1, true),
      [shortcutKeys("select.toggle")]: toggleFocused,
      [shortcutKeys("nav.open")]: () => {
        const issue = orderedRef.current.find(
          (entry) => entry.id === focusedRef.current,
        );
        if (!issue) return false;
        openIssue(issue.identifier);
        return true;
      },
      [shortcutKeys("nav.escape")]: () => {
        // Pickers and the overlay outrank the list; selection clears last.
        if (hasOpenPopover() || activeIdentifier) return false;
        if (selectedRef.current.length) {
          clear();
          return true;
        }
        if (!focusedRef.current) return false;
        focus(null);
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.view },
  );

  useShortcuts(
    {
      [shortcutKeys("select.all")]: () => {
        if (orderedRef.current.length === 0) return false;
        selectAll();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.view },
  );

  // Property shortcuts open the palette already scoped to that property, so
  // there is one nested picker implementation rather than four popovers.
  const openProperty = useCallback((property: PropertyId) => {
    const hasTarget =
      selectedRef.current.length > 0 || Boolean(focusedRef.current);
    if (!hasTarget) return false;
    openCommandPalette(property);
    return true;
  }, []);

  useShortcuts(
    {
      [shortcutKeys("issue.status")]: () => openProperty("status"),
      [shortcutKeys("issue.priority")]: () => openProperty("priority"),
      [shortcutKeys("issue.assignee")]: () => openProperty("assignee"),
      [shortcutKeys("issue.labels")]: () => openProperty("labels"),
    },
    { priority: SHORTCUT_PRIORITY.view },
  );
  const rowProps = {
    ctx,
    focusedId,
    selectedIds,
    activeIdentifier,
    onFocus: focus,
    onToggle: toggle,
    onRange: selectRange,
    onOpen: (issue: IssueListItem) => openIssue(issue.identifier),
    onProperty: (
      issue: IssueListItem,
      property: Parameters<typeof updateProperty>[1],
      value: Parameters<typeof updateProperty>[2],
    ) => void updateProperty(issue, property, value, ctx),
    onDelete: (issue: IssueListItem) => void deleteIssue(issue),
    rowActions,
    renderMenu: (issue: IssueListItem, node: React.ReactNode) => (
      <IssueRowMenu
        issue={issue}
        selection={selection}
        workspace={workspace}
        ctx={ctx}
        triage={triage}
        onTriage={onTriage}
      >
        {node}
      </IssueRowMenu>
    ),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {isLoading ? (
        <div className="flex flex-col gap-1 p-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className="h-8 w-full rounded-md" />
          ))}
        </div>
      ) : visibleGroups.length === 0 ? (
        <EmptyState message={emptyMessage} onCreateIssue={onCreateIssue} />
      ) : query.layout === "board" ? (
        <BoardLayout
          groups={visibleGroups}
          grouping={query.grouping}
          visibleColumns={query.visibleColumns}
          onReorder={reorderIssue}
          {...rowProps}
        />
      ) : (
        <ListLayout
          groups={visibleGroups}
          visibleColumns={query.visibleColumns}
          {...rowProps}
        />
      )}
    </div>
  );
}

type SharedRowProps = {
  ctx: PropertyContext;
  focusedId: string | null;
  selectedIds: string[];
  activeIdentifier: string | null;
  onFocus: (id: string) => void;
  onToggle: (id: string) => void;
  onRange: (id: string) => void;
  onOpen: (issue: IssueListItem) => void;
  onProperty: (issue: IssueListItem, property: never, value: never) => void;
  /** Wraps the row in the shared context menu. */
  renderMenu: (issue: IssueListItem, node: React.ReactNode) => React.ReactNode;
  onDelete: (issue: IssueListItem) => void;
  rowActions?: (issue: IssueListItem) => React.ReactNode;
};

function EmptyState({
  message,
  onCreateIssue,
}: {
  message: string;
  onCreateIssue?: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex size-11 items-center justify-center rounded-xl border border-dashed border-border text-muted-foreground">
        <IconLayoutList className="size-5" />
      </div>
      <p className="text-sm text-muted-foreground">{message}</p>
      {onCreateIssue ? (
        <button
          type="button"
          onClick={onCreateIssue}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          <IconPlus className="size-3.5" />
          Create issue
        </button>
      ) : null}
    </div>
  );
}

function GroupHeader({
  group,
  collapsed,
  onToggle,
}: {
  group: IssueGroupResult;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="sticky top-0 z-10 flex h-8 w-full cursor-pointer items-center gap-2 border-b border-border bg-muted/80 px-3 text-left backdrop-blur-sm"
    >
      <IconChevronRight
        className={cn(
          "size-3.5 text-muted-foreground transition-transform",
          !collapsed && "rotate-90",
        )}
      />
      {group.color ? (
        <span
          className="size-2 rounded-full"
          style={{ backgroundColor: group.color }}
        />
      ) : null}
      <span className="text-[12px] font-semibold">{group.label}</span>
      <span className="beam-meta">{group.count}</span>
    </button>
  );
}

function ListLayout({
  groups,
  visibleColumns,
  ...row
}: SharedRowProps & {
  groups: IssueGroupResult[];
  visibleColumns: string[];
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      {groups.map((group) => (
        <section key={group.key}>
          {group.key === "all" ? null : (
            <GroupHeader
              group={group}
              collapsed={Boolean(collapsed[group.key])}
              onToggle={() =>
                setCollapsed((current) => ({
                  ...current,
                  [group.key]: !current[group.key],
                }))
              }
            />
          )}
          {collapsed[group.key]
            ? null
            : group.issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  visibleColumns={visibleColumns}
                  {...row}
                />
              ))}
        </section>
      ))}
    </div>
  );
}

/**
 * Deliberately not a permanent checkbox column: it only occupies space once
 * the row is hovered or selected, so an unselected list stays as dense as it
 * was before multi-select existed.
 */
function SelectionToggle({
  selected,
  identifier,
  onToggle,
}: {
  selected: boolean;
  identifier: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={"Select " + identifier}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "size-3.5 shrink-0 cursor-pointer rounded-[4px] border transition-colors",
        selected
          ? "border-primary bg-primary"
          : "border-border opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      {selected ? (
        <IconCheck className="size-3 text-primary-foreground" stroke={3} />
      ) : null}
    </button>
  );
}
const IssueRow = memo(function IssueRow({
  issue,
  visibleColumns,
  ctx,
  focusedId,
  selectedIds,
  activeIdentifier,
  onFocus,
  onToggle,
  onRange,
  onOpen,
  onProperty,
  onDelete,
  rowActions,
}: SharedRowProps & { issue: IssueListItem; visibleColumns: string[] }) {
  const shows = (column: string) =>
    visibleColumns.length === 0 || visibleColumns.includes(column);
  const isFocused = focusedId === issue.id;
  const isActive = activeIdentifier === issue.identifier;
  const isSelected = selectedIds.includes(issue.id);

  return (
    <div
      data-issue-id={issue.id}
      role="button"
      tabIndex={0}
      aria-current={isActive ? "true" : undefined}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey) {
          event.preventDefault();
          onToggle(issue.id);
          return;
        }
        if (event.shiftKey) {
          event.preventDefault();
          // Stops the browser painting a text selection over the range.
          window.getSelection()?.removeAllRanges();
          onRange(issue.id);
          return;
        }
        onFocus(issue.id);
        onOpen(issue);
      }}
      onFocus={() => onFocus(issue.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(issue);
        }
      }}
      className={cn(
        "group relative flex h-9 cursor-pointer items-center gap-2 border-b border-border/70 px-3 text-[13px] outline-none transition-colors",
        "hover:bg-muted/60",
        isFocused && "bg-muted/70",
        isActive && "bg-accent/70",
        isSelected && "bg-primary/10 hover:bg-primary/15",
        // Subdued, still readable: archived rows only appear when the user
        // asked to see them.
        issue.archivedAt && "opacity-60",
      )}
    >
      {isFocused ? (
        <span className="absolute inset-y-0 start-0 w-[2px] bg-primary" />
      ) : null}

      <SelectionToggle
        selected={isSelected}
        identifier={issue.identifier}
        onToggle={() => onToggle(issue.id)}
      />

      {shows("priority") ? (
        <IssueProperty
          property="priority"
          value={issue.priority}
          ctx={ctx}
          variant="icon"
          onChange={(value) =>
            onProperty(issue, "priority" as never, value as never)
          }
        />
      ) : null}

      {shows("status") ? (
        <IssueProperty
          property="status"
          value={issue.status.id}
          ctx={ctx}
          variant="icon"
          onChange={(value) =>
            onProperty(issue, "status" as never, value as never)
          }
        />
      ) : null}

      {shows("identifier") ? (
        <span className="beam-meta w-[64px] shrink-0">{issue.identifier}</span>
      ) : null}

      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
        {issue.title}
      </span>

      {issue.archivedAt ? (
        <span className="beam-chip shrink-0 gap-1">
          <IconArchive className="size-3" />
          Archived
        </span>
      ) : null}

      {shows("labels") && issue.labels.length ? (
        <div className="hidden shrink-0 items-center gap-1 lg:flex">
          {issue.labels.slice(0, 2).map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
          {issue.labels.length > 2 ? (
            <span className="beam-meta">+{issue.labels.length - 2}</span>
          ) : null}
        </div>
      ) : null}

      {shows("project") && issue.project ? (
        <span className="beam-chip hidden max-w-[140px] truncate xl:inline-flex">
          {issue.project.name}
        </span>
      ) : null}

      {shows("cycle") && issue.cycle ? (
        <span className="beam-chip hidden shrink-0 xl:inline-flex">
          {issue.cycle.name ?? "Cycle " + issue.cycle.number}
        </span>
      ) : null}

      {shows("estimate") && issue.estimate !== null ? (
        <span className="beam-meta hidden w-5 shrink-0 text-right tabular-nums md:inline">
          {issue.estimate}
        </span>
      ) : null}

      {shows("dueDate") && issue.dueDate ? (
        <span className="beam-meta hidden shrink-0 md:inline">
          {formatShortDate(issue.dueDate)}
        </span>
      ) : null}

      {shows("source") && issue.triageSource ? (
        <span className="beam-chip hidden shrink-0 sm:inline-flex">
          {issue.triageSource}
        </span>
      ) : null}

      {shows("createdAt") ? (
        <span className="beam-meta hidden w-8 shrink-0 text-right md:inline">
          {formatRelative(issue.createdAt)}
        </span>
      ) : null}

      {shows("updatedAt") ? (
        <span className="beam-meta hidden w-8 shrink-0 text-right md:inline">
          {formatRelative(issue.updatedAt)}
        </span>
      ) : null}

      {shows("assignee") ? (
        <IssueProperty
          property="assignee"
          value={issue.assignee?.id ?? null}
          ctx={ctx}
          variant="icon"
          align="end"
          onChange={(value) =>
            onProperty(issue, "assignee" as never, value as never)
          }
        />
      ) : null}

      {rowActions ? (
        <span
          className="flex shrink-0 items-center gap-1"
          onClick={(event) => event.stopPropagation()}
        >
          {rowActions(issue)}
        </span>
      ) : null}

      <button
        type="button"
        aria-label={`Delete ${issue.identifier}`}
        onClick={(event) => {
          event.stopPropagation();
          onDelete(issue);
        }}
        className="hidden size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100 md:inline-flex"
      >
        <IconTrash className="size-3.5" />
      </button>
    </div>
  );
});

type DropTarget = { groupKey: string; beforeIssueId: string | null } | null;

function BoardLayout({
  groups,
  grouping,
  visibleColumns,
  onReorder,
  ...row
}: SharedRowProps & {
  groups: IssueGroupResult[];
  grouping: IssueGrouping;
  visibleColumns: string[];
  onReorder: (
    issue: IssueListItem,
    before: IssueListItem | null,
    after: IssueListItem | null,
    statusId?: string,
  ) => void;
}) {
  const [dragging, setDragging] = useState<IssueListItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget>(null);
  // Dragging only maps onto a status change when columns are statuses.
  const canChangeStatus = grouping === "status";

  function handleDrop(group: IssueGroupResult) {
    if (!dragging) return;
    const remaining = group.issues.filter((issue) => issue.id !== dragging.id);
    const index = dropTarget?.beforeIssueId
      ? remaining.findIndex((issue) => issue.id === dropTarget.beforeIssueId)
      : remaining.length;
    const at = index === -1 ? remaining.length : index;

    onReorder(
      dragging,
      remaining[at - 1] ?? null,
      remaining[at] ?? null,
      canChangeStatus ? group.key : undefined,
    );
    setDragging(null);
    setDropTarget(null);
  }

  return (
    <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden">
      <div className="flex h-full min-w-max gap-3 p-3">
        {groups.map((group) => {
          const isTarget = dropTarget?.groupKey === group.key;
          return (
            <div
              key={group.key}
              onDragOver={(event) => {
                if (!dragging) return;
                event.preventDefault();
                setDropTarget((current) =>
                  current?.groupKey === group.key
                    ? current
                    : { groupKey: group.key, beforeIssueId: null },
                );
              }}
              onDrop={(event) => {
                event.preventDefault();
                handleDrop(group);
              }}
              className={cn(
                "flex h-full w-[292px] min-w-[292px] flex-col rounded-lg border bg-muted/30 transition-colors",
                isTarget && dragging
                  ? "border-primary/60 bg-primary/5"
                  : "border-border",
              )}
            >
              <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
                {group.color ? (
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: group.color }}
                  />
                ) : null}
                <span className="truncate text-[12px] font-semibold">
                  {group.label}
                </span>
                <span className="beam-meta">{group.count}</span>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                {group.issues.map((issue) => (
                  <BoardCard
                    key={issue.id}
                    issue={issue}
                    visibleColumns={visibleColumns}
                    isDragging={dragging?.id === issue.id}
                    isDropBefore={
                      isTarget && dropTarget?.beforeIssueId === issue.id
                    }
                    onDragStart={() => setDragging(issue)}
                    onDragEnd={() => {
                      setDragging(null);
                      setDropTarget(null);
                    }}
                    onDragOverCard={() => {
                      if (!dragging) return;
                      setDropTarget({
                        groupKey: group.key,
                        beforeIssueId: issue.id,
                      });
                    }}
                    {...row}
                  />
                ))}
                {group.issues.length === 0 ? (
                  <p className="px-1 py-3 text-[12px] text-muted-foreground">
                    No issues
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const BoardCard = memo(function BoardCard({
  issue,
  visibleColumns,
  ctx,
  focusedId,
  activeIdentifier,
  onFocus,
  onOpen,
  onProperty,
  isDragging,
  isDropBefore,
  onDragStart,
  onDragEnd,
  onDragOverCard,
}: SharedRowProps & {
  issue: IssueListItem;
  visibleColumns: string[];
  isDragging: boolean;
  isDropBefore: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverCard: () => void;
}) {
  const isFocused = focusedId === issue.id;
  const isActive = activeIdentifier === issue.identifier;
  // Cards only honor the properties a card can sensibly carry; list-only
  // columns like Created or Estimate are ignored rather than crammed in.
  const shows = (column: string) =>
    visibleColumns.length === 0 || visibleColumns.includes(column);

  return (
    <article
      data-issue-id={issue.id}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", issue.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverCard();
      }}
      onClick={() => {
        onFocus(issue.id);
        onOpen(issue);
      }}
      className={cn(
        "cursor-pointer rounded-md border bg-card p-2.5 shadow-[0_1px_2px_rgba(16,18,32,0.04)] transition-all",
        "hover:border-border hover:shadow-[0_2px_8px_rgba(16,18,32,0.08)]",
        isDragging && "opacity-40",
        isDropBefore && "ring-2 ring-primary/50",
        isFocused || isActive ? "border-primary/50" : "border-border",
      )}
    >
      <div className="flex items-center gap-1.5">
        {shows("identifier") ? (
          <span className="beam-meta">{issue.identifier}</span>
        ) : null}
        <div className="ms-auto flex items-center gap-0.5">
          {shows("priority") ? (
            <IssueProperty
              property="priority"
              value={issue.priority}
              ctx={ctx}
              variant="icon"
              onChange={(value) =>
                onProperty(issue, "priority" as never, value as never)
              }
            />
          ) : null}
          {shows("assignee") ? (
            <IssueProperty
              property="assignee"
              value={issue.assignee?.id ?? null}
              ctx={ctx}
              variant="icon"
              align="end"
              onChange={(value) =>
                onProperty(issue, "assignee" as never, value as never)
              }
            />
          ) : null}
        </div>
      </div>

      <p className="mt-1.5 line-clamp-3 text-[13px] font-medium leading-5 text-foreground">
        {issue.title}
      </p>

      {shows("labels") && issue.labels.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {issue.labels.slice(0, 3).map((label) => (
            <LabelChip key={label.id} label={label} />
          ))}
        </div>
      ) : null}
    </article>
  );
});
