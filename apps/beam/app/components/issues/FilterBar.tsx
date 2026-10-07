/**
 * The filter builder edits the same `IssueQuery.filters` the engine reads —
 * there is no intermediate filter model.
 *
 * Semantics: every row is ANDed, values inside a row are ORed. "is not" and
 * "excludes" rows write into `filters.exclude`, which the engine turns into
 * `NOT (...)`. That keeps room for nested boolean groups later without
 * changing what today's fields mean.
 */
import {
  IconCalendarDue,
  IconCalendarPlus,
  IconClockEdit,
  IconFlag,
  IconFolder,
  IconLayoutGrid,
  IconPlus,
  IconProgressCheck,
  IconRefresh,
  IconTag,
  IconTarget,
  IconUser,
  IconUserPlus,
  IconX,
  type Icon,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

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
  STATUS_CATEGORY_LABEL,
  type IssueFilters,
  type IssueQuery,
  type StatusCategory,
} from "@/lib/issue-query";
import { cn } from "@/lib/utils";

import type { PropertyContext, PropertyOption } from "./properties";
import { MemberAvatar, PriorityIcon, StatusIcon } from "./primitives";

export type FilterFieldId =
  | "status"
  | "statusCategory"
  | "assignee"
  | "priority"
  | "project"
  | "milestone"
  | "cycle"
  | "label"
  | "creator"
  | "team"
  | "dueDate"
  | "createdAt"
  | "updatedAt";

type Operator =
  | "is"
  | "isNot"
  | "includes"
  | "excludes"
  | "before"
  | "after"
  | "isEmpty"
  | "isNotEmpty";

const OPERATOR_LABEL: Record<Operator, string> = {
  is: "is",
  isNot: "is not",
  includes: "includes",
  excludes: "excludes",
  before: "before",
  after: "after",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
};

type ListKey =
  | "teamId"
  | "statusId"
  | "statusCategory"
  | "assigneeId"
  | "priority"
  | "labelId"
  | "projectId"
  | "milestoneId"
  | "cycleId"
  | "creatorId";

type FilterFieldDef = {
  id: FilterFieldId;
  label: string;
  icon: Icon;
  operators: Operator[];
} & (
  | {
      kind: "list";
      key: ListKey;
      nullable?: boolean;
      options: (ctx: PropertyContext) => PropertyOption[];
    }
  | {
      kind: "date";
      beforeKey: keyof IssueFilters;
      afterKey: keyof IssueFilters;
      /** Only the due date can be unset. */
      emptiable?: boolean;
    }
);

function statusFilterOptions(ctx: PropertyContext): PropertyOption[] {
  const teams = ctx.team ? [ctx.team] : (ctx.workspace?.teams ?? []);
  const multiTeam = teams.length > 1;
  return teams.flatMap((team) =>
    team.statuses.map((status) => ({
      value: status.id,
      label: status.name,
      group: multiTeam ? team.name : undefined,
      icon: <StatusIcon status={status} />,
    })),
  );
}

function memberFilterOptions(ctx: PropertyContext): PropertyOption[] {
  return (ctx.workspace?.members ?? []).map((member) => ({
    value: member.id,
    label: member.name,
    group: member.kind === "agent" ? "Agents" : "People",
    keywords: member.kind,
    icon: <MemberAvatar member={member} size={18} />,
  }));
}

export const FILTER_FIELDS: Record<FilterFieldId, FilterFieldDef> = {
  status: {
    id: "status",
    label: "Status",
    icon: IconProgressCheck,
    kind: "list",
    key: "statusId",
    operators: ["is", "isNot"],
    options: statusFilterOptions,
  },
  statusCategory: {
    id: "statusCategory",
    label: "Status category",
    icon: IconLayoutGrid,
    kind: "list",
    key: "statusCategory",
    operators: ["is", "isNot"],
    options: () =>
      (Object.keys(STATUS_CATEGORY_LABEL) as StatusCategory[]).map(
        (category) => ({
          value: category,
          label: STATUS_CATEGORY_LABEL[category],
        }),
      ),
  },
  assignee: {
    id: "assignee",
    label: "Assignee",
    icon: IconUser,
    kind: "list",
    key: "assigneeId",
    nullable: true,
    operators: ["is", "isNot"],
    options: (ctx) => [
      {
        value: null,
        label: "Unassigned",
        icon: <MemberAvatar member={null} size={18} />,
      },
      ...memberFilterOptions(ctx),
    ],
  },
  priority: {
    id: "priority",
    label: "Priority",
    icon: IconFlag,
    kind: "list",
    key: "priority",
    operators: ["is", "isNot"],
    options: () =>
      PRIORITY_ORDER.map((priority) => ({
        value: priority,
        label: PRIORITY_LABEL[priority],
        icon: <PriorityIcon priority={priority} />,
      })),
  },
  project: {
    id: "project",
    label: "Project",
    icon: IconFolder,
    kind: "list",
    key: "projectId",
    nullable: true,
    operators: ["is", "isNot"],
    options: (ctx) => [
      { value: null, label: "No project" },
      ...(ctx.workspace?.projects ?? []).map((project) => ({
        value: project.id,
        label: project.name,
      })),
    ],
  },
  milestone: {
    id: "milestone",
    label: "Milestone",
    icon: IconTarget,
    kind: "list",
    key: "milestoneId",
    nullable: true,
    operators: ["is", "isNot"],
    options: (ctx) => {
      const all = ctx.workspace?.projects ?? [];
      const scoped = ctx.projectId
        ? all.filter((project) => project.id === ctx.projectId)
        : all;
      const options: PropertyOption[] = [
        { value: null, label: "No milestone" },
      ];
      for (const project of scoped) {
        for (const milestone of project.milestones) {
          options.push({
            value: milestone.id,
            label: milestone.name,
            group: scoped.length > 1 ? project.name : undefined,
          });
        }
      }
      return options;
    },
  },
  cycle: {
    id: "cycle",
    label: "Cycle",
    icon: IconRefresh,
    kind: "list",
    key: "cycleId",
    nullable: true,
    operators: ["is", "isNot"],
    options: (ctx) => {
      const teams = ctx.team ? [ctx.team] : (ctx.workspace?.teams ?? []);
      const multiTeam = teams.length > 1;
      return [
        { value: null, label: "No cycle" },
        ...teams.flatMap((team) =>
          team.cycles.map((cycle) => ({
            value: cycle.id,
            label: cycle.name || `Cycle ${cycle.number}`,
            group: multiTeam ? team.name : undefined,
          })),
        ),
      ];
    },
  },
  label: {
    id: "label",
    label: "Labels",
    icon: IconTag,
    kind: "list",
    key: "labelId",
    operators: ["includes", "excludes"],
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
  },
  creator: {
    id: "creator",
    label: "Creator",
    icon: IconUserPlus,
    kind: "list",
    key: "creatorId",
    operators: ["is", "isNot"],
    options: memberFilterOptions,
  },
  team: {
    id: "team",
    label: "Team",
    icon: IconLayoutGrid,
    kind: "list",
    key: "teamId",
    operators: ["is", "isNot"],
    options: (ctx) =>
      (ctx.workspace?.teams ?? []).map((team) => ({
        value: team.id,
        label: team.name,
        icon: (
          <span
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: team.color ?? "#8b8f9c" }}
          />
        ),
      })),
  },
  dueDate: {
    id: "dueDate",
    label: "Due date",
    icon: IconCalendarDue,
    kind: "date",
    beforeKey: "dueBefore",
    afterKey: "dueAfter",
    emptiable: true,
    operators: ["before", "after", "isEmpty", "isNotEmpty"],
  },
  createdAt: {
    id: "createdAt",
    label: "Created",
    icon: IconCalendarPlus,
    kind: "date",
    beforeKey: "createdBefore",
    afterKey: "createdAfter",
    operators: ["before", "after"],
  },
  updatedAt: {
    id: "updatedAt",
    label: "Updated",
    icon: IconClockEdit,
    kind: "date",
    beforeKey: "updatedBefore",
    afterKey: "updatedAfter",
    operators: ["before", "after"],
  },
};

const FIELD_ORDER: FilterFieldId[] = [
  "status",
  "statusCategory",
  "assignee",
  "priority",
  "project",
  "milestone",
  "cycle",
  "label",
  "creator",
  "team",
  "dueDate",
  "createdAt",
  "updatedAt",
];

type ActiveRow = {
  field: FilterFieldId;
  operator: Operator;
  /** List rows only. */
  values: (string | null)[];
  /** Date rows only. */
  date?: string;
};

function listValues(
  filters: IssueFilters,
  key: ListKey,
  negated: boolean,
): (string | null)[] {
  const source = negated ? filters.exclude : filters;
  return ((source?.[key] as (string | null)[] | undefined) ?? []).slice();
}

export function activeRows(filters: IssueFilters): ActiveRow[] {
  const rows: ActiveRow[] = [];

  for (const id of FIELD_ORDER) {
    const def = FILTER_FIELDS[id];
    if (def.kind === "list") {
      const positive = listValues(filters, def.key, false);
      if (positive.length) {
        rows.push({
          field: id,
          operator: def.operators[0],
          values: positive,
        });
      }
      const negative = listValues(filters, def.key, true);
      if (negative.length) {
        rows.push({
          field: id,
          operator: def.operators[1],
          values: negative,
        });
      }
      continue;
    }

    const before = filters[def.beforeKey] as string | undefined;
    if (before) rows.push({ field: id, operator: "before", values: [], date: before });
    const after = filters[def.afterKey] as string | undefined;
    if (after) rows.push({ field: id, operator: "after", values: [], date: after });
    if (def.emptiable && filters.dueSet !== undefined) {
      rows.push({
        field: id,
        operator: filters.dueSet ? "isNotEmpty" : "isEmpty",
        values: [],
      });
    }
  }

  return rows;
}

export function filterCount(filters: IssueFilters): number {
  return activeRows(filters).length;
}

function withListValues(
  filters: IssueFilters,
  key: ListKey,
  negated: boolean,
  values: (string | null)[],
): IssueFilters {
  if (!negated) {
    const next = { ...filters };
    if (values.length) (next as Record<string, unknown>)[key] = values;
    else delete (next as Record<string, unknown>)[key];
    return next;
  }

  const exclude = { ...(filters.exclude ?? {}) } as Record<string, unknown>;
  if (values.length) exclude[key] = values;
  else delete exclude[key];
  const next = { ...filters, exclude } as Record<string, unknown>;
  if (Object.keys(exclude).length === 0) delete next.exclude;
  return next as IssueFilters;
}

function clearDateRow(
  filters: IssueFilters,
  field: FilterFieldId,
  operator: Operator,
): IssueFilters {
  const def = FILTER_FIELDS[field];
  if (def.kind !== "date") return filters;
  const next = { ...filters } as Record<string, unknown>;
  if (operator === "before") delete next[def.beforeKey];
  if (operator === "after") delete next[def.afterKey];
  if (operator === "isEmpty" || operator === "isNotEmpty") delete next.dueSet;
  return next as IssueFilters;
}

function isNegated(operator: Operator): boolean {
  return operator === "isNot" || operator === "excludes";
}

export function clearAllFilters(
  filters: IssueFilters,
  base: IssueFilters,
): IssueFilters {
  const next = { ...base };
  if (filters.search) next.search = filters.search;
  else delete next.search;
  return next;
}

function valueLabel(
  def: FilterFieldDef,
  values: (string | null)[],
  ctx: PropertyContext,
): string {
  if (def.kind !== "list") return "";
  const options = def.options(ctx);
  const labels = values.map(
    (value) =>
      options.find((option) => option.value === value)?.label ?? String(value),
  );
  if (labels.length === 0) return "any";
  if (labels.length <= 2) return labels.join(", ");
  return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
}

function formatDateValue(value: string | undefined): string {
  if (!value) return "…";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Pill({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "inline-flex h-6 max-w-[220px] cursor-pointer items-center gap-1 px-1.5 text-[12px] text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </button>
  );
}

function ValuePicker({
  def,
  values,
  ctx,
  onChange,
}: {
  def: FilterFieldDef;
  values: (string | null)[];
  ctx: PropertyContext;
  onChange: (values: (string | null)[]) => void;
}) {
  const options = useMemo(
    () => (def.kind === "list" ? def.options(ctx) : []),
    [def, ctx],
  );
  const groups = useMemo(() => {
    const map = new Map<string, PropertyOption[]>();
    for (const option of options) {
      const key = option.group ?? "";
      map.set(key, [...(map.get(key) ?? []), option]);
    }
    return [...map.entries()];
  }, [options]);

  return (
    <Command>
      <CommandInput placeholder={`Filter by ${def.label.toLowerCase()}…`} />
      <CommandList className="max-h-72">
        <CommandEmpty>No matches.</CommandEmpty>
        {groups.map(([group, groupOptions]) => (
          <CommandGroup key={group || "default"} heading={group || undefined}>
            {groupOptions.map((option) => {
              const selected = values.includes(option.value);
              return (
                <CommandItem
                  key={option.value ?? "none"}
                  value={`${option.label} ${option.keywords ?? ""}`}
                  onSelect={() =>
                    onChange(
                      selected
                        ? values.filter((value) => value !== option.value)
                        : [...values, option.value],
                    )
                  }
                  className="gap-2 text-[13px]"
                >
                  {option.icon}
                  <span className="truncate">{option.label}</span>
                  {selected ? (
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

function FilterRow({
  row,
  ctx,
  filters,
  onFiltersChange,
}: {
  row: ActiveRow;
  ctx: PropertyContext;
  filters: IssueFilters;
  onFiltersChange: (filters: IssueFilters) => void;
}) {
  const def = FILTER_FIELDS[row.field];
  const Icon = def.icon;

  function setOperator(operator: Operator) {
    if (def.kind === "list") {
      const cleared = withListValues(filters, def.key, isNegated(row.operator), []);
      onFiltersChange(
        withListValues(cleared, def.key, isNegated(operator), row.values),
      );
      return;
    }
    const cleared = clearDateRow(filters, row.field, row.operator);
    if (operator === "isEmpty") {
      onFiltersChange({ ...cleared, dueSet: false });
    } else if (operator === "isNotEmpty") {
      onFiltersChange({ ...cleared, dueSet: true });
    } else {
      const key = operator === "before" ? def.beforeKey : def.afterKey;
      onFiltersChange({
        ...cleared,
        [key]: row.date ?? new Date().toISOString(),
      });
    }
  }

  function remove() {
    if (def.kind === "list") {
      onFiltersChange(
        withListValues(filters, def.key, isNegated(row.operator), []),
      );
      return;
    }
    onFiltersChange(clearDateRow(filters, row.field, row.operator));
  }

  const dateEditable = row.operator === "before" || row.operator === "after";

  return (
    <div className="inline-flex h-6 items-center overflow-hidden rounded-md border border-border bg-card">
      <span className="inline-flex h-6 items-center gap-1 border-e border-border px-1.5 text-[12px] text-muted-foreground">
        <Icon className="size-3.5" />
        {def.label}
      </span>

      <Popover>
        <PopoverTrigger asChild>
          <Pill className="border-e border-border text-muted-foreground">
            {OPERATOR_LABEL[row.operator]}
          </Pill>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-40 p-1">
          {def.operators.map((operator) => (
            <button
              key={operator}
              type="button"
              onClick={() => setOperator(operator)}
              className={cn(
                "flex h-7 w-full cursor-pointer items-center rounded px-2 text-[13px] transition-colors hover:bg-accent",
                operator === row.operator && "font-medium text-primary",
              )}
            >
              {OPERATOR_LABEL[operator]}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      {def.kind === "list" ? (
        <Popover>
          <PopoverTrigger asChild>
            <Pill className="font-medium">
              <span className="truncate">{valueLabel(def, row.values, ctx)}</span>
            </Pill>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-60 p-0">
            <ValuePicker
              def={def}
              values={row.values}
              ctx={ctx}
              onChange={(values) =>
                onFiltersChange(
                  withListValues(
                    filters,
                    def.key,
                    isNegated(row.operator),
                    values,
                  ),
                )
              }
            />
          </PopoverContent>
        </Popover>
      ) : dateEditable ? (
        <label className="inline-flex h-6 cursor-pointer items-center px-1.5 text-[12px] font-medium">
          <span className="sr-only">{def.label} value</span>
          <input
            type="date"
            value={row.date ? row.date.slice(0, 10) : ""}
            onChange={(event) => {
              const key =
                row.operator === "before"
                  ? (def as { beforeKey: keyof IssueFilters }).beforeKey
                  : (def as { afterKey: keyof IssueFilters }).afterKey;
              const value = event.target.value;
              onFiltersChange({
                ...filters,
                [key]: value
                  ? new Date(`${value}T12:00:00`).toISOString()
                  : undefined,
              });
            }}
            className="w-[104px] bg-transparent text-[12px] outline-none"
          />
        </label>
      ) : null}

      <button
        type="button"
        aria-label={`Remove ${def.label} filter`}
        onClick={remove}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center border-s border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <IconX className="size-3" />
      </button>
    </div>
  );
}

export function AddFilterMenu({
  filters,
  onFiltersChange,
  ctx,
  trigger,
}: {
  filters: IssueFilters;
  onFiltersChange: (filters: IssueFilters) => void;
  ctx: PropertyContext;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<FilterFieldId | null>(null);

  const pendingDef = pending ? FILTER_FIELDS[pending] : null;

  function pickField(field: FilterFieldId) {
    const def = FILTER_FIELDS[field];
    if (def.kind === "date") {
      onFiltersChange({
        ...filters,
        [def.beforeKey]: new Date().toISOString(),
      });
      setOpen(false);
      return;
    }
    setPending(field);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPending(null);
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-0">
        {pendingDef && pendingDef.kind === "list" ? (
          <ValuePicker
            def={pendingDef}
            values={listValues(filters, pendingDef.key, false)}
            ctx={ctx}
            onChange={(values) =>
              onFiltersChange(
                withListValues(filters, pendingDef.key, false, values),
              )
            }
          />
        ) : (
          <Command>
            <CommandInput placeholder="Filter by…" />
            <CommandList className="max-h-72">
              <CommandEmpty>No properties.</CommandEmpty>
              <CommandGroup>
                {FIELD_ORDER.map((field) => {
                  const def = FILTER_FIELDS[field];
                  const Icon = def.icon;
                  return (
                    <CommandItem
                      key={field}
                      value={def.label}
                      onSelect={() => pickField(field)}
                      className="gap-2 text-[13px]"
                    >
                      <Icon className="size-4 text-muted-foreground" />
                      {def.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  query,
  onQueryChange,
  ctx,
  contextFilters,
}: {
  query: IssueQuery;
  onQueryChange: (query: IssueQuery) => void;
  ctx: PropertyContext;
  contextFilters: IssueFilters;
}) {
  const rows = activeRows(query.filters);
  if (rows.length === 0) return null;

  const setFilters = (filters: IssueFilters) =>
    onQueryChange({ ...query, filters });

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-3 py-1.5">
      {rows.map((row) => (
        <FilterRow
          key={`${row.field}-${row.operator}`}
          row={row}
          ctx={ctx}
          filters={query.filters}
          onFiltersChange={setFilters}
        />
      ))}

      <AddFilterMenu
        filters={query.filters}
        onFiltersChange={setFilters}
        ctx={ctx}
        trigger={
          <button
            type="button"
            className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-dashed border-border px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconPlus className="size-3" />
            Add filter
          </button>
        }
      />

      <button
        type="button"
        onClick={() =>
          setFilters(clearAllFilters(query.filters, contextFilters))
        }
        className="ms-1 h-6 cursor-pointer rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Clear all
      </button>
    </div>
  );
}

/** Short human summary of the active filters, used by the Views list. */
export function describeFilters(
  filters: IssueFilters,
  ctx: PropertyContext,
): string[] {
  return activeRows(filters).map((row) => {
    const def = FILTER_FIELDS[row.field];
    const parts = [def.label, OPERATOR_LABEL[row.operator]];
    if (def.kind === "list") parts.push(valueLabel(def, row.values, ctx));
    else if (row.date) parts.push(formatDateValue(row.date));
    return parts.join(" ");
  });
}
