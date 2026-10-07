/**
 * Issue view state lives in the URL so a reload, a shared link and the browser
 * Back button all reproduce the same view.
 *
 * Everything is written as a diff against the route's base query, which is why
 * `/team/ENG/issues` stays clean while `?layout=board&priority=high,urgent`
 * says exactly what the user changed. A key present with an empty value means
 * "explicitly cleared" so a preset filter (My Issues' assignee) can be removed
 * and still survive a reload.
 *
 * Params owned by other concerns (notably `?issue=` for the detail overlay)
 * are never touched here.
 */
import {
  DEFAULT_VISIBLE_COLUMNS,
  issueQuery,
  type IssueExclusions,
  type IssueFilters,
  type IssueGrouping,
  type IssueLayout,
  type IssueOrderField,
  type IssueQuery,
} from "./issue-query";

/** Owned by the issue overlay, not by view state. */
export const OVERLAY_PARAM = "issue";

const NULL_TOKEN = "none";

type ListKey =
  | "teamId"
  | "statusId"
  | "statusCategory"
  | "assigneeId"
  | "priority"
  | "labelId"
  | "projectId"
  | "cycleId"
  | "milestoneId"
  | "creatorId";

/** `param` is the include form; the exclude form appends `!`. */
const LIST_PARAMS: Record<ListKey, string> = {
  teamId: "team",
  statusId: "status",
  statusCategory: "category",
  assigneeId: "assignee",
  priority: "priority",
  labelId: "label",
  projectId: "project",
  cycleId: "cycle",
  milestoneId: "milestone",
  creatorId: "creator",
};

const NULLABLE_KEYS = new Set<ListKey>([
  "assigneeId",
  "projectId",
  "cycleId",
  "milestoneId",
]);

const DATE_PARAMS = {
  dueBefore: "dueBefore",
  dueAfter: "dueAfter",
  createdBefore: "createdBefore",
  createdAfter: "createdAfter",
  updatedBefore: "updatedBefore",
  updatedAfter: "updatedAfter",
} as const;

type DateKey = keyof typeof DATE_PARAMS;

const GROUPINGS: IssueGrouping[] = [
  "status",
  "assignee",
  "priority",
  "project",
  "cycle",
  "label",
  "none",
];

const ORDER_FIELDS: IssueOrderField[] = [
  "manual",
  "priority",
  "updatedAt",
  "createdAt",
  "dueDate",
  "title",
];

function encodeList(values: (string | null)[]): string {
  return values.map((value) => value ?? NULL_TOKEN).join(",");
}

function decodeList(raw: string, nullable: boolean): (string | null)[] {
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => (nullable && value === NULL_TOKEN ? null : value));
}

function sameList(a?: (string | null)[], b?: (string | null)[]): boolean {
  if (!a?.length && !b?.length) return true;
  if (a?.length !== b?.length) return false;
  return a!.every((value, index) => value === b![index]);
}

function readList(
  filters: IssueFilters | IssueExclusions | undefined,
  key: ListKey,
): (string | null)[] | undefined {
  return filters?.[key] as (string | null)[] | undefined;
}

function writeList(
  target: Record<string, unknown>,
  key: ListKey,
  values: (string | null)[],
) {
  if (values.length === 0) {
    delete target[key];
    return;
  }
  target[key] = values;
}

/** Serializes `query` as the difference from `base`. */
export function serializeQuery(
  query: IssueQuery,
  base: IssueQuery,
): URLSearchParams {
  const params = new URLSearchParams();

  if (query.layout !== base.layout) params.set("layout", query.layout);
  if (query.grouping !== base.grouping) params.set("group", query.grouping);

  const order = query.ordering[0];
  const baseOrder = base.ordering[0];
  if (
    order &&
    (order.field !== baseOrder?.field ||
      order.direction !== baseOrder?.direction)
  ) {
    params.set(
      "sort",
      order.direction === "desc" ? `${order.field}:desc` : order.field,
    );
  }

  const search = query.filters.search?.trim() ?? "";
  const baseSearch = base.filters.search?.trim() ?? "";
  if (search !== baseSearch) params.set("q", search);

  for (const key of Object.keys(LIST_PARAMS) as ListKey[]) {
    const param = LIST_PARAMS[key];

    const next = readList(query.filters, key) ?? [];
    const prev = readList(base.filters, key) ?? [];
    if (!sameList(next, prev)) params.set(param, encodeList(next));

    const nextExcluded = readList(query.filters.exclude, key) ?? [];
    const prevExcluded = readList(base.filters.exclude, key) ?? [];
    if (!sameList(nextExcluded, prevExcluded)) {
      params.set(`${param}!`, encodeList(nextExcluded));
    }
  }

  for (const key of Object.keys(DATE_PARAMS) as DateKey[]) {
    const next = query.filters[key] ?? "";
    const prev = base.filters[key] ?? "";
    if (next !== prev) params.set(DATE_PARAMS[key], next);
  }

  if (query.filters.dueSet !== base.filters.dueSet) {
    params.set("due", query.filters.dueSet === true ? "set" : "empty");
  }

  if (
    Boolean(query.filters.includeArchived) !==
    Boolean(base.filters.includeArchived)
  ) {
    params.set("archived", query.filters.includeArchived ? "1" : "0");
  }

  // Empty string is meaningful: it means "the user cleared every column",
  // which must not silently fall back to the defaults on reload.
  if (!sameList(query.visibleColumns, base.visibleColumns)) {
    params.set("cols", query.visibleColumns.join(","));
  }

  return params;
}

/** Applies URL params on top of `base`. */
export function parseQuery(
  params: URLSearchParams,
  base: IssueQuery,
): IssueQuery {
  const filters: Record<string, unknown> = {
    ...base.filters,
    exclude: { ...base.filters.exclude },
  };
  const exclude = filters.exclude as Record<string, unknown>;

  const layoutParam = params.get("layout");
  const layout: IssueLayout =
    layoutParam === "board" || layoutParam === "list"
      ? layoutParam
      : base.layout;

  const groupParam = params.get("group") as IssueGrouping | null;
  const grouping =
    groupParam && GROUPINGS.includes(groupParam) ? groupParam : base.grouping;

  let ordering = base.ordering;
  const sortParam = params.get("sort");
  if (sortParam) {
    const [rawField, rawDirection] = sortParam.split(":");
    const field = rawField as IssueOrderField;
    if (ORDER_FIELDS.includes(field)) {
      ordering = [
        { field, direction: rawDirection === "desc" ? "desc" : "asc" },
      ];
    }
  }

  const searchParam = params.get("q");
  if (searchParam !== null) {
    if (searchParam.trim()) filters.search = searchParam.trim();
    else delete filters.search;
  }

  for (const key of Object.keys(LIST_PARAMS) as ListKey[]) {
    const param = LIST_PARAMS[key];
    const nullable = NULLABLE_KEYS.has(key);

    const raw = params.get(param);
    if (raw !== null) writeList(filters, key, decodeList(raw, nullable));

    const rawExcluded = params.get(`${param}!`);
    if (rawExcluded !== null) {
      writeList(exclude, key, decodeList(rawExcluded, nullable));
    }
  }

  for (const key of Object.keys(DATE_PARAMS) as DateKey[]) {
    const raw = params.get(DATE_PARAMS[key]);
    if (raw === null) continue;
    if (raw) filters[key] = raw;
    else delete filters[key];
  }

  const dueParam = params.get("due");
  if (dueParam === "set") filters.dueSet = true;
  else if (dueParam === "empty") filters.dueSet = false;
  else if (dueParam !== null) delete filters.dueSet;

  const archivedParam = params.get("archived");
  if (archivedParam === "1") filters.includeArchived = true;
  else if (archivedParam !== null) delete filters.includeArchived;

  if (Object.keys(exclude).length === 0) delete filters.exclude;

  const colsParam = params.get("cols");
  const fallback = base.visibleColumns.length
    ? base.visibleColumns
    : DEFAULT_VISIBLE_COLUMNS;

  return {
    filters: filters as IssueFilters,
    grouping,
    ordering,
    layout,
    visibleColumns:
      colsParam === null
        ? fallback
        : colsParam
          ? colsParam.split(",").filter(Boolean)
          : [],
  };
}

/**
 * Merges view params into the current location's params, leaving unrelated
 * params (the issue overlay) untouched.
 */
export function mergeViewParams(
  current: URLSearchParams,
  viewParams: URLSearchParams,
): URLSearchParams {
  const next = new URLSearchParams();
  const overlay = current.get(OVERLAY_PARAM);
  if (overlay) next.set(OVERLAY_PARAM, overlay);
  for (const [key, value] of viewParams) next.set(key, value);
  return next;
}

/** True when two queries describe the same view. */
export function sameQuery(a: IssueQuery, b: IssueQuery): boolean {
  return serializeQuery(a, b).toString() === "";
}

/** Rebuilds a saved view's stored descriptor into a full IssueQuery. */
export function savedViewQuery(stored: Partial<IssueQuery>): IssueQuery {
  return issueQuery({
    filters: stored.filters ?? {},
    grouping: stored.grouping ?? "status",
    ordering: stored.ordering?.length
      ? stored.ordering
      : [{ field: "manual", direction: "asc" }],
    layout: stored.layout ?? "list",
    visibleColumns: stored.visibleColumns?.length
      ? stored.visibleColumns
      : DEFAULT_VISIBLE_COLUMNS,
  });
}
