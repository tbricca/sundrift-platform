/**
 * The bar is a thin shell over the issue-property registry: every picker here
 * is the same `PropertyOptionList` the row and the rail use, and every write
 * goes through `useBulkMutations`.
 *
 * Cross-team selections narrow rather than guess. Statuses, cycles and
 * milestones are team- or project-specific, so those pickers switch off with a
 * reason instead of silently writing something invalid. "Current cycle" and
 * "next cycle" stay available because the server resolves them per issue.
 */
import { IconChevronUp, IconDots, IconX } from "@tabler/icons-react";
import { useMemo } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useBulkMutations } from "@/hooks/use-bulk-mutations";
import type { IssueListItem, WorkspaceBootstrap } from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  PROPERTY_DEFS,
  PropertyOptionList,
  type PropertyContext,
  type PropertyId,
} from "./properties";
import { useIssueSelection } from "./selection";

/**
 * What a selection has in common. Everything team- or project-specific keys off
 * this rather than off any single issue.
 */
export function selectionScope(
  selected: IssueListItem[],
  workspace: WorkspaceBootstrap | null,
) {
  const teamIds = [...new Set(selected.map((issue) => issue.team.id))];
  const projectIds = [
    ...new Set(selected.map((issue) => issue.project?.id ?? null)),
  ];
  const team =
    teamIds.length === 1
      ? (workspace?.teams.find((entry) => entry.id === teamIds[0]) ?? null)
      : null;
  return {
    teamIds,
    team,
    singleTeam: teamIds.length === 1,
    projectId: projectIds.length === 1 ? projectIds[0] : undefined,
    sameProject: projectIds.length === 1,
  };
}

function BarButton({
  children,
  onClick,
  disabled,
  title,
  destructive,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-accent",
        destructive
          ? "text-destructive hover:bg-destructive/10"
          : "text-foreground",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent",
      )}
    >
      {children}
    </button>
  );
}

function PropertyPicker({
  property,
  ctx,
  selected,
  disabledReason,
}: {
  property: PropertyId;
  ctx: PropertyContext;
  selected: IssueListItem[];
  disabledReason?: string;
}) {
  const { bulkProperty } = useBulkMutations();
  const def = PROPERTY_DEFS[property];
  const options = useMemo(() => def.options(ctx), [def, ctx]);

  if (disabledReason) {
    return (
      <BarButton disabled title={disabledReason}>
        {def.label}
      </BarButton>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-accent">
        {def.label}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-60 p-0">
        <PropertyOptionList
          label={def.label.toLowerCase()}
          value={null}
          searchable={def.searchable || options.length > 8}
          options={options}
          onPick={(value) => void bulkProperty(selected, property, value, ctx)}
        />
      </PopoverContent>
    </Popover>
  );
}

function LabelPicker({
  ctx,
  selected,
  direction,
}: {
  ctx: PropertyContext;
  selected: IssueListItem[];
  direction: "add" | "remove";
}) {
  const { bulkLabel } = useBulkMutations();
  const options = useMemo(
    () =>
      (ctx.workspace?.labels ?? []).map((label) => ({
        value: label.id,
        label: label.name,
      })),
    [ctx.workspace],
  );

  return (
    <Popover>
      <PopoverTrigger className="inline-flex h-7 w-full cursor-pointer items-center rounded-sm px-2 text-[13px] transition-colors hover:bg-accent">
        {direction === "add" ? "Add label…" : "Remove label…"}
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-56 p-0">
        <PropertyOptionList
          label="label"
          value={null}
          searchable
          options={options}
          onPick={(value) =>
            void bulkLabel(selected, value as string, direction, ctx)
          }
        />
      </PopoverContent>
    </Popover>
  );
}

export function BulkActionBar({
  ctx,
  onOpenPalette,
  leading,
}: {
  ctx: PropertyContext;
  onOpenPalette: () => void;
  /** Surface-specific actions shown first, e.g. the triage decisions. */
  leading?: (ctx: PropertyContext) => React.ReactNode;
}) {
  const { selected, clear, reconcile } = useIssueSelection();
  const { bulkCycleTarget, bulkRemove, bulkUnarchive } = useBulkMutations();

  const scope = useMemo(
    () => selectionScope(selected, ctx.workspace),
    [selected, ctx.workspace],
  );

  // Team-specific option lists must come from the selection's own team.
  const scopedCtx: PropertyContext = useMemo(
    () => ({ ...ctx, team: scope.team, projectId: scope.projectId ?? null }),
    [ctx, scope.team, scope.projectId],
  );

  if (selected.length === 0) return null;

  const crossTeam = "Select issues from a single team to change this.";
  const crossProject = "Select issues in the same project to set a milestone.";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg border border-border bg-popover px-1.5 py-1 shadow-md">
        <span className="ms-1 me-1 shrink-0 text-[12px] font-semibold tabular-nums">
          {selected.length} selected
        </span>

        {leading?.(scopedCtx)}

        <PropertyPicker
          property="status"
          ctx={scopedCtx}
          selected={selected}
          disabledReason={scope.singleTeam ? undefined : crossTeam}
        />
        <PropertyPicker
          property="assignee"
          ctx={scopedCtx}
          selected={selected}
        />
        <PropertyPicker
          property="priority"
          ctx={scopedCtx}
          selected={selected}
        />
        <PropertyPicker
          property="project"
          ctx={scopedCtx}
          selected={selected}
        />
        <PropertyPicker
          property="cycle"
          ctx={scopedCtx}
          selected={selected}
          disabledReason={scope.singleTeam ? undefined : crossTeam}
        />

        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors hover:bg-accent">
            <IconDots className="size-3.5" />
            More
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56">
            <DropdownMenuItem
              className="text-[13px]"
              onSelect={() => void bulkCycleTarget(selected, "current")}
            >
              Move to current cycle
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-[13px]"
              onSelect={() => void bulkCycleTarget(selected, "next")}
            >
              Move to next cycle
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <div className="p-0.5">
              <LabelPicker
                ctx={scopedCtx}
                selected={selected}
                direction="add"
              />
              <LabelPicker
                ctx={scopedCtx}
                selected={selected}
                direction="remove"
              />
            </div>
            <DropdownMenuSeparator />
            {scope.sameProject ? (
              <div className="p-0.5">
                <Popover>
                  <PopoverTrigger className="inline-flex h-7 w-full cursor-pointer items-center rounded-sm px-2 text-[13px] transition-colors hover:bg-accent">
                    Set milestone…
                  </PopoverTrigger>
                  <PopoverContent align="start" side="top" className="w-56 p-0">
                    <MilestoneBulkPicker ctx={scopedCtx} selected={selected} />
                  </PopoverContent>
                </Popover>
              </div>
            ) : (
              <DropdownMenuItem disabled className="text-[13px]">
                Set milestone — {crossProject}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {selected.some((issue) => !issue.archivedAt) ? (
              <DropdownMenuItem
                className="text-[13px]"
                onSelect={() => {
                  void bulkRemove(
                    selected.filter((issue) => !issue.archivedAt),
                    "archived",
                  );
                  reconcile({ clearAll: true });
                }}
              >
                Archive
              </DropdownMenuItem>
            ) : null}
            {selected.some((issue) => issue.archivedAt) ? (
              <DropdownMenuItem
                className="text-[13px]"
                onSelect={() => {
                  void bulkUnarchive(
                    selected.filter((issue) => issue.archivedAt),
                  );
                  reconcile({ clearAll: true });
                }}
              >
                Unarchive
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="text-[13px] text-destructive focus:text-destructive"
              onSelect={() => {
                void bulkRemove(selected, "deleted");
                reconcile({ clearAll: true });
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <BarButton onClick={onOpenPalette} title="Command palette">
          <IconChevronUp className="size-3.5" />
          <kbd className="rounded border border-border px-1 text-[10px]">
            ⌘K
          </kbd>
        </BarButton>

        <button
          type="button"
          aria-label="Clear selection"
          onClick={clear}
          className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconX className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

function MilestoneBulkPicker({
  ctx,
  selected,
}: {
  ctx: PropertyContext;
  selected: IssueListItem[];
}) {
  const { bulkProperty } = useBulkMutations();
  const def = PROPERTY_DEFS.milestone;
  const options = useMemo(() => def.options(ctx), [def, ctx]);

  return (
    <PropertyOptionList
      label="milestone"
      value={null}
      searchable={options.length > 8}
      options={options}
      onPick={(value) => void bulkProperty(selected, "milestone", value, ctx)}
    />
  );
}
