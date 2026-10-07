/**
 * Every issue route renders this. It owns the header controls, the URL-backed
 * view state, the filter builder, the save-view affordance and the detail
 * overlay; routes only supply a title, a context and the starting IssueQuery.
 *
 * The live query is always `base + URL params`, so Back/Forward moves between
 * view configurations and a shared link reproduces exactly what the sender saw.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconAdjustments,
  IconChevronDown,
  IconFilter,
  IconLayoutColumns,
  IconLayoutList,
  IconPlus,
  IconSearch,
  IconSelector,
  IconSortAscending,
  IconX,
} from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";

import { BulkActionBar } from "@/components/issues/BulkActionBar";
import { openCreateIssue } from "@/components/issues/CreateIssueDialog";
import { openCommandPalette } from "@/components/command/CommandPalette";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { KeyHint } from "@/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useWorkspace } from "@/hooks/use-workspace";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import {
  GROUPING_LABEL,
  ISSUE_COLUMNS,
  ORDER_FIELD_LABEL,
  toggleColumn,
  type IssueGrouping,
  type IssueOrderField,
  type IssueQuery,
} from "@/lib/issue-query";
import { cn } from "@/lib/utils";
import {
  mergeViewParams,
  parseQuery,
  sameQuery,
  serializeQuery,
} from "@/lib/view-url";

import { AddFilterMenu, FilterBar, filterCount } from "./FilterBar";
import { IssueOverlay } from "./IssueOverlay";
import { IssueViewEngine } from "./IssueViewEngine";
import type { PropertyContext, WorkspaceTeam } from "./properties";
import type { IssueListItem } from "@/lib/types";
import type { TriageAction } from "@/components/menus/IssueContextMenu";

export type ViewContextType =
  | "team"
  | "my-issues"
  | "backlog"
  | "saved-view"
  | "project"
  | "cycle"
  | "triage";

export type ViewContext = { type: ViewContextType; id?: string };

export type SurfaceSavedView = {
  id: string;
  name: string;
  teamId: string | null;
  isShared: boolean;
  isOwn: boolean;
};

const GROUPING_OPTIONS: IssueGrouping[] = [
  "status",
  "assignee",
  "priority",
  "project",
  "cycle",
  "label",
  "none",
];

const ORDER_OPTIONS: IssueOrderField[] = [
  "manual",
  "priority",
  "updatedAt",
  "createdAt",
  "dueDate",
  "title",
];

function ToolbarButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-transparent px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ViewSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(Boolean(value));
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  // Debounced so typing does not refetch the view on every keystroke.
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 250);
    return () => clearTimeout(timer);
  }, [draft, value, onChange]);

  if (!open && !value) {
    return (
      <ToolbarButton
        aria-label="Search this view"
        onClick={() => {
          setOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
      >
        <IconSearch className="size-3.5" />
      </ToolbarButton>
    );
  }

  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute start-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={inputRef}
        value={draft}
        placeholder="Search this view…"
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          setDraft("");
          onChange("");
          setOpen(false);
        }}
        onBlur={() => {
          if (!draft) setOpen(false);
        }}
        className="h-7 w-44 rounded-md border border-border bg-background ps-7 pe-6 text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
      />
      {draft ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute end-1 top-1/2 inline-flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <IconX className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

/** Same query key the renderer uses, so this reads the cache, not the network. */
function IssueCount({ query }: { query: IssueQuery }) {
  const params = useMemo(() => ({ query }), [query]);
  const { data } = useActionQuery<{ total: number }>("list-issues", params);
  const total = data?.total ?? 0;
  return (
    <span className="beam-meta mr-1 shrink-0">
      {total} {total === 1 ? "issue" : "issues"}
    </span>
  );
}

function SaveViewDialog({
  open,
  onOpenChange,
  defaultName,
  defaultTeamId,
  teams,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  defaultTeamId: string | null;
  teams: WorkspaceTeam[];
  onSave: (input: {
    name: string;
    teamId: string | null;
    isShared: boolean;
  }) => Promise<void>;
}) {
  const [name, setName] = useState(defaultName);
  const [teamId, setTeamId] = useState<string | null>(defaultTeamId);
  const [isShared, setIsShared] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(defaultName);
    setTeamId(defaultTeamId);
    setIsShared(false);
  }, [open, defaultName, defaultTeamId]);

  async function submit() {
    if (!name.trim() || pending) return;
    setPending(true);
    try {
      await onSave({ name: name.trim(), teamId, isShared });
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-[13px] font-semibold">
          Save view
        </DialogTitle>
        <DialogDescription className="sr-only">
          Save the current filters, grouping, ordering and layout as a view.
        </DialogDescription>

        <div className="flex flex-col gap-3 p-4">
          <Input
            autoFocus
            value={name}
            placeholder="View name"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            className="h-8 text-[13px]"
          />

          <div className="flex items-center gap-2">
            <label
              className="text-[12px] text-muted-foreground"
              htmlFor="view-team"
            >
              Team
            </label>
            <select
              id="view-team"
              value={teamId ?? ""}
              onChange={(event) => setTeamId(event.target.value || null)}
              className="h-7 flex-1 cursor-pointer rounded-md border border-border bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Workspace</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-muted-foreground">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(event) => setIsShared(event.target.checked)}
              className="size-3.5 cursor-pointer accent-[hsl(var(--primary))]"
            />
            Share with the workspace
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-7 cursor-pointer rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!name.trim() || pending}
            onClick={() => void submit()}
            className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save view
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function IssueViewSurface({
  title,
  accessory,
  meta,
  baseQuery,
  context,
  savedView,
  team,
  projectId,
  emptyMessage,
  tabs,
  rowActions,
  bulkLeading,
  triage,
  onTriage,
}: {
  title: React.ReactNode;
  accessory?: React.ReactNode;
  /** Rendered after the title, for surface context such as cycle dates. */
  meta?: React.ReactNode;
  baseQuery: IssueQuery;
  context: ViewContext;
  savedView?: SurfaceSavedView | null;
  team?: WorkspaceTeam | null;
  /** Scopes milestone options to one project. */
  projectId?: string;
  emptyMessage?: string;
  /** Rendered under the toolbar, e.g. the Triage tabs. */
  tabs?: React.ReactNode;
  /** Trailing per-row controls, e.g. Accept/Decline/Snooze. */
  rowActions?: (issue: IssueListItem) => React.ReactNode;
  /** Extra bulk actions, e.g. the Triage decisions. */
  bulkLeading?: (ctx: PropertyContext) => React.ReactNode;
  /** Adds the review decisions to each row's context menu. */
  triage?: boolean;
  onTriage?: (action: TriageAction, issues: IssueListItem[]) => void;
}) {
  const { workspace } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [saveOpen, setSaveOpen] = useState(false);

  const query = useMemo(
    () => parseQuery(searchParams, baseQuery),
    [searchParams, baseQuery],
  );

  const setQuery = useCallback(
    (next: IssueQuery) => {
      setSearchParams(
        (current) => mergeViewParams(current, serializeQuery(next, baseQuery)),
        { preventScrollReset: true },
      );
    },
    [baseQuery, setSearchParams],
  );

  const ctx: PropertyContext = useMemo(
    () => ({ workspace, team: team ?? null, projectId }),
    [workspace, team, projectId],
  );

  const dirty = Boolean(savedView) && !sameQuery(query, baseQuery);
  const order = query.ordering[0] ?? { field: "manual", direction: "asc" };
  const activeFilters = filterCount(query.filters);

  const refreshViews = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ["action", "list-saved-views"],
    });
    void queryClient.invalidateQueries({
      queryKey: ["action", "get-workspace"],
    });
  }, [queryClient]);

  async function createView(input: {
    name: string;
    teamId: string | null;
    isShared: boolean;
  }) {
    try {
      await callAction(
        "create-saved-view",
        { ...input, query },
        { method: "POST" },
      );
      refreshViews();
      toast.success(`Saved “${input.name}”`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that view.",
      );
    }
  }

  async function saveChanges() {
    if (!savedView) return;
    try {
      await callAction(
        "update-saved-view",
        { id: savedView.id, query },
        { method: "PUT" },
      );
      refreshViews();
      toast.success("View updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update that view.",
      );
    }
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        {accessory}
        <h1 className="truncate text-[13px] font-semibold">{title}</h1>
        {meta}
        {savedView ? (
          <span className="beam-chip shrink-0">
            {savedView.isShared ? "Shared view" : "Private view"}
          </span>
        ) : null}
        {dirty ? (
          <span className="beam-meta shrink-0 italic">Unsaved changes</span>
        ) : null}

        <div className="ms-auto flex items-center gap-1">
          {dirty && savedView?.isOwn ? (
            <>
              <ToolbarButton
                onClick={() => void saveChanges()}
                className="border-border text-foreground"
              >
                Save changes
              </ToolbarButton>
              <ToolbarButton onClick={() => setSaveOpen(true)}>
                Save as new
              </ToolbarButton>
            </>
          ) : (
            <ToolbarButton onClick={() => setSaveOpen(true)}>
              Save view
            </ToolbarButton>
          )}
        </div>
      </header>

      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-3">
        <IssueCount query={query} />

        <AddFilterMenu
          filters={query.filters}
          onFiltersChange={(filters) => setQuery({ ...query, filters })}
          ctx={ctx}
          trigger={
            <ToolbarButton>
              <IconFilter className="size-3.5" />
              Filter
              {activeFilters ? (
                <span className="rounded bg-primary/12 px-1 text-[11px] font-semibold text-primary">
                  {activeFilters}
                </span>
              ) : null}
            </ToolbarButton>
          }
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton>
              <IconSelector className="size-3.5" />
              {GROUPING_LABEL[query.grouping]}
              <IconChevronDown className="size-3 opacity-60" />
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Group by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={query.grouping}
              onValueChange={(value) =>
                setQuery({ ...query, grouping: value as IssueGrouping })
              }
            >
              {GROUPING_OPTIONS.map((grouping) => (
                <DropdownMenuRadioItem
                  key={grouping}
                  value={grouping}
                  className="text-[13px]"
                >
                  {GROUPING_LABEL[grouping]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton>
              <IconSortAscending className="size-3.5" />
              {ORDER_FIELD_LABEL[order.field]}
              <IconChevronDown className="size-3 opacity-60" />
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Order by
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={order.field}
              onValueChange={(value) =>
                setQuery({
                  ...query,
                  ordering: [
                    {
                      field: value as IssueOrderField,
                      direction: order.direction,
                    },
                  ],
                })
              }
            >
              {ORDER_OPTIONS.map((field) => (
                <DropdownMenuRadioItem
                  key={field}
                  value={field}
                  className="text-[13px]"
                >
                  {ORDER_FIELD_LABEL[field]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={order.direction}
              onValueChange={(value) =>
                setQuery({
                  ...query,
                  ordering: [
                    {
                      field: order.field,
                      direction: value as "asc" | "desc",
                    },
                  ],
                })
              }
            >
              <DropdownMenuRadioItem value="asc" className="text-[13px]">
                Ascending
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="desc" className="text-[13px]">
                Descending
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButton>
              <IconAdjustments className="size-3.5" />
              Display
              <IconChevronDown className="size-3 opacity-60" />
            </ToolbarButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Properties
            </DropdownMenuLabel>
            {ISSUE_COLUMNS.filter((column) => !column.fixed).map((column) => (
              <DropdownMenuCheckboxItem
                key={column.id}
                className="text-[13px]"
                checked={query.visibleColumns.includes(column.id)}
                // Keeps the menu open so several properties can be toggled
                // in one pass.
                onSelect={(event) => event.preventDefault()}
                onCheckedChange={(checked) =>
                  setQuery({
                    ...query,
                    visibleColumns: toggleColumn(
                      query.visibleColumns,
                      column.id,
                      checked === true,
                    ),
                  })
                }
              >
                {column.label}
                {query.layout === "board" && !column.board ? (
                  <span className="beam-meta ms-auto">List only</span>
                ) : null}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              className="text-[13px]"
              checked={Boolean(query.filters.includeArchived)}
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                setQuery({
                  ...query,
                  filters: {
                    ...query.filters,
                    includeArchived: checked === true ? true : undefined,
                  },
                })
              }
            >
              Show archived
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="ms-auto flex items-center gap-1">
          <ViewSearch
            value={query.filters.search ?? ""}
            onChange={(search) =>
              setQuery({
                ...query,
                filters: { ...query.filters, search: search || undefined },
              })
            }
          />

          <div className="flex items-center rounded-md border border-border p-0.5">
            {(["list", "board"] as const).map((layout) => {
              const Icon =
                layout === "list" ? IconLayoutList : IconLayoutColumns;
              const active = query.layout === layout;
              return (
                <button
                  key={layout}
                  type="button"
                  aria-label={`${layout} layout`}
                  aria-pressed={active}
                  onClick={() => setQuery({ ...query, layout })}
                  className={cn(
                    "inline-flex size-6 cursor-pointer items-center justify-center rounded transition-colors",
                    active
                      ? "bg-accent text-accent-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <ToolbarButton
                onClick={() => openCreateIssue()}
                className="border-border text-foreground"
              >
                <IconPlus className="size-3.5" />
                New issue
              </ToolbarButton>
            </TooltipTrigger>
            <TooltipContent className="flex items-center gap-1.5">
              Create issue
              <KeyHint token={shortcutKeys("issue.create")} />
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {tabs}

      <FilterBar
        query={query}
        onQueryChange={setQuery}
        ctx={ctx}
        contextFilters={baseQuery.filters}
      />

      <div className="min-h-0 flex-1">
        <IssueViewEngine
          query={query}
          workspace={workspace}
          team={team ?? null}
          onCreateIssue={openCreateIssue}
          emptyMessage={emptyMessage}
          rowActions={rowActions}
          triage={triage}
          onTriage={onTriage}
        />
      </div>

      <BulkActionBar
        ctx={ctx}
        onOpenPalette={openCommandPalette}
        leading={bulkLeading}
      />

      <IssueOverlay />

      <SaveViewDialog
        open={saveOpen}
        onOpenChange={setSaveOpen}
        defaultName={
          savedView ? `${savedView.name} copy` : defaultViewName(context, title)
        }
        defaultTeamId={team?.id ?? savedView?.teamId ?? null}
        teams={workspace?.teams ?? []}
        onSave={createView}
      />
    </div>
  );
}

function defaultViewName(context: ViewContext, title: React.ReactNode): string {
  if (typeof title === "string") return title;
  return context.type === "my-issues" ? "My Issues" : "New view";
}
