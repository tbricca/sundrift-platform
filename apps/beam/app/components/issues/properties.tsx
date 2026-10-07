/**
 * One definition per issue property — label, icon, current value rendering,
 * empty state, picker options and the `update-issue` patch it produces.
 *
 * Every surface (detail rail, list rows, board cards, create dialog, filters)
 * renders `<IssueProperty />` against this registry instead of hand-rolling a
 * picker, so behaviour and styling stay identical everywhere.
 */
import {
  IconCalendar,
  IconChevronDown,
  IconFolder,
  IconFlag,
  IconGauge,
  IconProgressCheck,
  IconRefresh,
  IconTag,
  IconTarget,
  IconUser,
  type Icon,
} from "@tabler/icons-react";
import { useMemo, useState, type ReactNode } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  type Priority,
} from "@/lib/issue-query";
import { CYCLE_STATE_LABEL, cycleState, cycleTitle } from "@/lib/cycle";
import type {
  IssueDetail,
  IssueListItem,
  LabelRef,
  MemberRef,
  StatusRef,
  WorkspaceBootstrap,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import {
  LabelChip,
  MemberAvatar,
  PriorityIcon,
  StatusIcon,
  formatShortDate,
} from "./primitives";

export type PropertyId =
  | "status"
  | "priority"
  | "assignee"
  | "project"
  | "cycle"
  | "milestone"
  | "labels"
  | "dueDate"
  | "estimate";

export type PropertyValue = string | string[] | number | null;

export type WorkspaceTeam = WorkspaceBootstrap["teams"][number];

export type PropertyContext = {
  workspace: WorkspaceBootstrap | null;
  team: WorkspaceTeam | null;
  /** Needed so milestone options can follow the issue's project. */
  projectId?: string | null;
};

export type PropertyOption = {
  value: string | null;
  label: string;
  icon?: ReactNode;
  group?: string;
  keywords?: string;
};

export type PropertyDef = {
  id: PropertyId;
  label: string;
  icon: Icon;
  empty: string;
  editor: "select" | "multiselect" | "date" | "number";
  /** Reads the current value off an issue row or detail. */
  read: (issue: IssueListItem | IssueDetail) => PropertyValue;
  /** Renders the current value. */
  render: (value: PropertyValue, ctx: PropertyContext) => ReactNode;
  options: (ctx: PropertyContext) => PropertyOption[];
  /** Builds the `update-issue` patch for a new value. */
  patch: (value: PropertyValue) => Record<string, unknown>;
  searchable?: boolean;
};

const ESTIMATES = [1, 2, 3, 5, 8, 13];

function statusOptions(ctx: PropertyContext): PropertyOption[] {
  return (ctx.team?.statuses ?? []).map((status) => ({
    value: status.id,
    label: status.name,
    icon: <StatusIcon status={status} />,
  }));
}

function memberOptions(ctx: PropertyContext): PropertyOption[] {
  const members = ctx.workspace?.members ?? [];
  return [
    { value: null, label: "Unassigned", icon: <MemberAvatar member={null} size={18} /> },
    ...members.map((member) => ({
      value: member.id,
      label: member.name,
      // Humans and agents share one picker; the avatar carries the distinction.
      group: member.kind === "agent" ? "Agents" : "People",
      icon: <MemberAvatar member={member} size={18} />,
      keywords: member.kind,
    })),
  ];
}

export const PROPERTY_DEFS: Record<PropertyId, PropertyDef> = {
  status: {
    id: "status",
    label: "Status",
    icon: IconProgressCheck,
    empty: "No status",
    editor: "select",
    read: (issue) => issue.status.id,
    render: (value, ctx) => {
      const status =
        (ctx.team?.statuses ?? []).find((entry) => entry.id === value) ?? null;
      if (!status) return null;
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <StatusIcon status={status} />
          <span className="truncate">{status.name}</span>
        </span>
      );
    },
    options: statusOptions,
    patch: (value) => ({ statusId: value }),
  },

  priority: {
    id: "priority",
    label: "Priority",
    icon: IconFlag,
    empty: PRIORITY_LABEL.none,
    editor: "select",
    read: (issue) => issue.priority,
    render: (value) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <PriorityIcon priority={(value as Priority) ?? "none"} />
        <span className="truncate">{PRIORITY_LABEL[(value as Priority) ?? "none"]}</span>
      </span>
    ),
    options: () =>
      PRIORITY_ORDER.map((priority) => ({
        value: priority,
        label: PRIORITY_LABEL[priority],
        icon: <PriorityIcon priority={priority} />,
      })),
    patch: (value) => ({ priority: value }),
  },

  assignee: {
    id: "assignee",
    label: "Assignee",
    icon: IconUser,
    empty: "Unassigned",
    editor: "select",
    read: (issue) => issue.assignee?.id ?? null,
    render: (value, ctx) => {
      const member =
        (ctx.workspace?.members ?? []).find((entry) => entry.id === value) ??
        null;
      return (
        <span className="flex min-w-0 items-center gap-1.5">
          <MemberAvatar member={member as MemberRef | null} size={18} />
          <span className="truncate">{member?.name ?? "Unassigned"}</span>
        </span>
      );
    },
    options: memberOptions,
    patch: (value) => ({ assigneeId: value }),
    searchable: true,
  },

  project: {
    id: "project",
    label: "Project",
    icon: IconFolder,
    empty: "No project",
    editor: "select",
    read: (issue) => issue.project?.id ?? null,
    render: (value, ctx) => {
      const project = (ctx.workspace?.projects ?? []).find(
        (entry) => entry.id === value,
      );
      return (
        <span className="truncate">{project?.name ?? "No project"}</span>
      );
    },
    options: (ctx) => [
      { value: null, label: "No project" },
      ...(ctx.workspace?.projects ?? []).map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
    patch: (value) => ({ projectId: value }),
    searchable: true,
  },

  cycle: {
    id: "cycle",
    label: "Cycle",
    icon: IconRefresh,
    empty: "No cycle",
    editor: "select",
    read: (issue) => issue.cycle?.id ?? null,
    render: (value, ctx) => {
      const cycle = (ctx.team?.cycles ?? []).find((entry) => entry.id === value);
      return (
        <span className="truncate">
          {cycle ? cycleTitle(cycle) : "No cycle"}
        </span>
      );
    },
    // Only the issue's own team's cycles are offered; the server rejects any
    // other cycle anyway.
    options: (ctx) => [
      { value: null, label: "No cycle" },
      ...(ctx.team?.cycles ?? []).map((cycle) => ({
        value: cycle.id,
        label: cycleTitle(cycle),
        keywords: cycle.name ?? undefined,
        group: CYCLE_STATE_LABEL[cycleState(cycle)],
      })),
    ],
    patch: (value) => ({ cycleId: value }),
  },

  milestone: {
    id: "milestone",
    label: "Milestone",
    icon: IconTarget,
    empty: "No milestone",
    editor: "select",
    read: (issue) =>
      "milestone" in issue ? ((issue as IssueDetail).milestone?.id ?? null) : null,
    render: (value, ctx) => {
      const milestone = (ctx.workspace?.projects ?? [])
        .flatMap((project) => project.milestones)
        .find((entry) => entry.id === value);
      return <span className="truncate">{milestone?.name ?? "No milestone"}</span>;
    },
    options: (ctx) => {
      const project = (ctx.workspace?.projects ?? []).find(
        (entry) => entry.id === ctx.projectId,
      );
      return [
        { value: null, label: "No milestone" },
        ...(project?.milestones ?? []).map((milestone) => ({
          value: milestone.id,
          label: milestone.name,
        })),
      ];
    },
    patch: (value) => ({ milestoneId: value }),
  },

  labels: {
    id: "labels",
    label: "Labels",
    icon: IconTag,
    empty: "No labels",
    editor: "multiselect",
    read: (issue) => issue.labels.map((label) => label.id),
    render: (value, ctx) => {
      const ids = (value as string[]) ?? [];
      const all = ctx.workspace?.labels ?? [];
      const selected = all.filter((label) => ids.includes(label.id));
      if (selected.length === 0) {
        return <span className="text-muted-foreground">No labels</span>;
      }
      return (
        <span className="flex flex-wrap gap-1">
          {selected.map((label) => (
            <LabelChip key={label.id} label={label as LabelRef} />
          ))}
        </span>
      );
    },
    options: (ctx) =>
      (ctx.workspace?.labels ?? []).map((label) => ({
        value: label.id,
        label: label.name,
        icon: (
          <span
            className="size-2.5 rounded-full"
            style={{ backgroundColor: label.color }}
          />
        ),
      })),
    patch: (value) => ({ labelIds: value ?? [] }),
    searchable: true,
  },

  dueDate: {
    id: "dueDate",
    label: "Due date",
    icon: IconCalendar,
    empty: "No due date",
    editor: "date",
    read: (issue) => issue.dueDate,
    render: (value) => (
      <span className="truncate">
        {value ? formatShortDate(value as string) : "No due date"}
      </span>
    ),
    options: () => [],
    patch: (value) => ({ dueDate: value }),
  },

  estimate: {
    id: "estimate",
    label: "Estimate",
    icon: IconGauge,
    empty: "No estimate",
    editor: "number",
    read: (issue) => issue.estimate,
    render: (value) => (
      <span className="truncate">{value ? `${value} points` : "No estimate"}</span>
    ),
    options: () => [
      { value: null, label: "No estimate" },
      ...ESTIMATES.map((points) => ({
        value: String(points),
        label: `${points} ${points === 1 ? "point" : "points"}`,
      })),
    ],
    patch: (value) => ({
      estimate: value === null || value === "" ? null : Number(value),
    }),
  },
};

export const DETAIL_PROPERTY_ORDER: PropertyId[] = [
  "status",
  "priority",
  "assignee",
  "project",
  "milestone",
  "cycle",
  "estimate",
  "dueDate",
  "labels",
];

/** Builds the `update-issue` patch for a property change. */
export function propertyPatch(
  property: PropertyId,
  value: PropertyValue,
): Record<string, unknown> {
  return PROPERTY_DEFS[property].patch(value);
}

type Variant = "icon" | "inline" | "rail";

export function IssueProperty({
  property,
  value,
  onChange,
  ctx,
  variant = "inline",
  disabled,
  className,
  align = "start",
}: {
  property: PropertyId;
  value: PropertyValue;
  onChange: (value: PropertyValue) => void;
  ctx: PropertyContext;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  align?: "start" | "end";
}) {
  const def = PROPERTY_DEFS[property];
  const [open, setOpen] = useState(false);

  const triggerContent =
    variant === "icon" ? (
      <IconOnlyValue def={def} value={value} ctx={ctx} />
    ) : (
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        {def.render(value, ctx)}
      </span>
    );

  const trigger = (
    <PopoverTrigger
      disabled={disabled}
      aria-label={`${def.label}: ${plainValue(def, value, ctx)}`}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-md text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default disabled:opacity-60",
        variant === "icon" && "size-6 justify-center hover:bg-accent",
        variant === "inline" && "h-6 gap-1.5 px-1.5 text-[12px] hover:bg-accent",
        variant === "rail" &&
          "h-7 w-full gap-1.5 px-1.5 text-[13px] hover:bg-accent",
        className,
      )}
    >
      {triggerContent}
      {variant === "rail" ? (
        <IconChevronDown className="ms-auto size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/rail:opacity-100" />
      ) : null}
    </PopoverTrigger>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {trigger}
      <PopoverContent
        align={align}
        className="w-60 p-0"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        {def.editor === "date" ? (
          <DateEditor
            value={value as string | null}
            onChange={(next) => {
              onChange(next);
              setOpen(false);
            }}
          />
        ) : (
          <OptionList
            def={def}
            value={value}
            ctx={ctx}
            onPick={(next) => {
              onChange(next);
              if (def.editor !== "multiselect") setOpen(false);
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

function plainValue(
  def: PropertyDef,
  value: PropertyValue,
  ctx: PropertyContext,
): string {
  const options = def.options(ctx);
  if (def.editor === "multiselect") {
    const ids = (value as string[]) ?? [];
    return ids.length ? `${ids.length} selected` : def.empty;
  }
  const match = options.find((option) => option.value === value);
  return match?.label ?? (value ? String(value) : def.empty);
}

function IconOnlyValue({
  def,
  value,
  ctx,
}: {
  def: PropertyDef;
  value: PropertyValue;
  ctx: PropertyContext;
}) {
  if (def.id === "priority") {
    return <PriorityIcon priority={(value as Priority) ?? "none"} />;
  }
  if (def.id === "status") {
    const status = (ctx.team?.statuses ?? []).find(
      (entry) => entry.id === value,
    ) as StatusRef | undefined;
    return status ? <StatusIcon status={status} /> : null;
  }
  if (def.id === "assignee") {
    const member =
      (ctx.workspace?.members ?? []).find((entry) => entry.id === value) ?? null;
    return <MemberAvatar member={member as MemberRef | null} size={20} />;
  }
  const Icon = def.icon;
  return <Icon className="size-4 text-muted-foreground" />;
}

function OptionList({
  def,
  value,
  ctx,
  onPick,
}: {
  def: PropertyDef;
  value: PropertyValue;
  ctx: PropertyContext;
  onPick: (value: PropertyValue) => void;
}) {
  const options = useMemo(() => def.options(ctx), [def, ctx]);
  const groups = useMemo(() => {
    const map = new Map<string, PropertyOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [options]);

  const selectedIds = def.editor === "multiselect" ? ((value as string[]) ?? []) : [];

  return (
    <Command>
      {def.searchable || options.length > 8 ? (
        <CommandInput placeholder={`Change ${def.label.toLowerCase()}…`} />
      ) : null}
      <CommandList className="max-h-64">
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map(([group, groupOptions]) => (
          <CommandGroup key={group || "default"} heading={group || undefined}>
            {groupOptions.map((option) => {
              const isSelected =
                def.editor === "multiselect"
                  ? selectedIds.includes(option.value as string)
                  : option.value === value;
              return (
                <CommandItem
                  key={option.value ?? "none"}
                  value={`${option.label} ${option.keywords ?? ""}`}
                  onSelect={() => {
                    if (def.editor === "multiselect") {
                      const next = isSelected
                        ? selectedIds.filter((id) => id !== option.value)
                        : [...selectedIds, option.value as string];
                      onPick(next);
                    } else {
                      onPick(option.value);
                    }
                  }}
                  className="gap-2 text-[13px]"
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {isSelected ? (
                    <span className="ms-auto text-primary">✓</span>
                  ) : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  );
}

function DateEditor({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const initial = value ? new Date(value).toISOString().slice(0, 10) : "";
  return (
    <div className="flex flex-col gap-2 p-2">
      <input
        type="date"
        defaultValue={initial}
        autoFocus
        onChange={(event) => {
          const next = event.target.value;
          onChange(next ? new Date(`${next}T12:00:00`).toISOString() : null);
        }}
        className="h-8 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="h-7 cursor-pointer rounded-md text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Clear due date
        </button>
      ) : null}
    </div>
  );
}

/**
 * The same picker body the issue rail uses, exposed for surfaces that are not
 * issues (project properties) so there is one picker design in the app.
 */
export function PropertyOptionList({
  options,
  value,
  label,
  multi,
  searchable,
  onPick,
}: {
  options: PropertyOption[];
  value: PropertyValue;
  label: string;
  multi?: boolean;
  searchable?: boolean;
  onPick: (value: PropertyValue) => void;
}) {
  const def = {
    editor: multi ? "multiselect" : "select",
    label,
    searchable,
    options: () => options,
  } as unknown as PropertyDef;

  return (
    <OptionList
      def={def}
      value={value}
      ctx={EMPTY_CONTEXT}
      onPick={onPick}
    />
  );
}

const EMPTY_CONTEXT: PropertyContext = { workspace: null, team: null };

export { DateEditor as PropertyDateEditor };
