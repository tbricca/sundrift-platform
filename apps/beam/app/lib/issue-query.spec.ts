import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISIBLE_COLUMNS,
  ISSUE_COLUMNS,
  backlogQuery,
  cycleQuery,
  myIssuesQuery,
  projectIssuesQuery,
  teamIssuesQuery,
  toggleColumn,
  triageQuery,
} from "./issue-query";

describe("triage and the shared query presets", () => {
  it("leaves the triage scope unset on every normal preset", () => {
    // Unset is what makes the engine hide unreviewed intake, so no preset has
    // to opt out of triage individually.
    for (const query of [
      teamIssuesQuery("t1"),
      backlogQuery("t1"),
      myIssuesQuery("m1"),
      cycleQuery("c1"),
      projectIssuesQuery("p1"),
    ]) {
      expect(query.filters.triage).toBeUndefined();
    }
  });

  it("scopes the triage preset to one team and pending review", () => {
    const query = triageQuery("t1");
    expect(query.filters).toMatchObject({ teamId: ["t1"], triage: "pending" });
    expect(query.grouping).toBe("none");
    expect(query.layout).toBe("list");
    expect(query.ordering[0]).toEqual({ field: "createdAt", direction: "asc" });
  });

  it("reuses the same preset for reviewed scopes", () => {
    expect(triageQuery("t1", "declined").filters.triage).toBe("declined");
    expect(triageQuery("t1", "snoozed").filters.triage).toBe("snoozed");
  });
});

describe("visible columns", () => {
  const order = ISSUE_COLUMNS.map((column) => column.id);

  it("keeps the canonical order however columns are added", () => {
    const built = toggleColumn(
      toggleColumn(["title"], "assignee", true),
      "priority",
      true,
    );
    expect(built).toEqual(["priority", "title", "assignee"]);
  });

  it("produces the same list regardless of toggle order", () => {
    const a = toggleColumn(
      toggleColumn(["title"], "dueDate", true),
      "status",
      true,
    );
    const b = toggleColumn(
      toggleColumn(["title"], "status", true),
      "dueDate",
      true,
    );
    expect(a).toEqual(b);
  });

  it("removes a column without disturbing the rest", () => {
    const without = toggleColumn(DEFAULT_VISIBLE_COLUMNS, "project", false);
    expect(without).not.toContain("project");
    expect(without).toEqual(
      DEFAULT_VISIBLE_COLUMNS.filter((column) => column !== "project"),
    );
  });

  it("never drops the fixed columns, so the list is never empty", () => {
    // An empty list means "show everything" to the renderer, so the toggle
    // model has to be incapable of producing one.
    let columns = [...DEFAULT_VISIBLE_COLUMNS];
    for (const column of order) columns = toggleColumn(columns, column, false);
    expect(columns).toEqual(["title"]);
  });

  it("defaults to columns the registry knows about, in registry order", () => {
    for (const column of DEFAULT_VISIBLE_COLUMNS) {
      expect(order).toContain(column);
    }
    expect(DEFAULT_VISIBLE_COLUMNS).toEqual(
      order.filter((column) => DEFAULT_VISIBLE_COLUMNS.includes(column)),
    );
  });

  it("keeps the triage preset inside the registry too", () => {
    for (const column of triageQuery("t1").visibleColumns) {
      expect(order).toContain(column);
    }
  });
});
