import { describe, expect, it } from "vitest";

import { issueQuery, teamIssuesQuery } from "./issue-query";
import {
  mergeViewParams,
  parseQuery,
  sameQuery,
  serializeQuery,
} from "./view-url";

const base = teamIssuesQuery("team-1");

function roundTrip(next: ReturnType<typeof issueQuery>) {
  return parseQuery(serializeQuery(next, base), base);
}

describe("view-url", () => {
  it("writes nothing when the view matches its base", () => {
    expect(serializeQuery(base, base).toString()).toBe("");
    expect(sameQuery(base, base)).toBe(true);
  });

  it("round-trips layout, grouping and ordering", () => {
    const next = {
      ...base,
      layout: "board" as const,
      grouping: "assignee" as const,
      ordering: [{ field: "priority" as const, direction: "desc" as const }],
    };

    const params = serializeQuery(next, base);
    expect(params.get("layout")).toBe("board");
    expect(params.get("group")).toBe("assignee");
    expect(params.get("sort")).toBe("priority:desc");
    expect(roundTrip(next)).toEqual(next);
  });

  it("keeps the base filters out of the URL", () => {
    const next = {
      ...base,
      filters: { ...base.filters, priority: ["urgent" as const] },
    };

    const params = serializeQuery(next, base);
    expect(params.get("team")).toBeNull();
    expect(params.get("priority")).toBe("urgent");
    expect(roundTrip(next).filters.teamId).toEqual(["team-1"]);
  });

  it("encodes null ids as a readable token", () => {
    const next = {
      ...base,
      filters: { ...base.filters, assigneeId: [null, "member-1"] },
    };

    expect(serializeQuery(next, base).get("assignee")).toBe("none,member-1");
    expect(roundTrip(next).filters.assigneeId).toEqual([null, "member-1"]);
  });

  it("round-trips exclusions", () => {
    const next = {
      ...base,
      filters: { ...base.filters, exclude: { statusId: ["done-1"] } },
    };

    expect(serializeQuery(next, base).get("status!")).toBe("done-1");
    expect(roundTrip(next).filters.exclude).toEqual({ statusId: ["done-1"] });
  });

  it("records an explicitly cleared preset filter", () => {
    const myIssues = issueQuery({ filters: { assigneeId: ["me"] } });
    const cleared = { ...myIssues, filters: {} };

    const params = serializeQuery(cleared, myIssues);
    expect(params.get("assignee")).toBe("");
    expect(parseQuery(params, myIssues).filters.assigneeId).toBeUndefined();
  });

  it("round-trips date filters", () => {
    const next = {
      ...base,
      filters: {
        ...base.filters,
        dueBefore: "2026-02-01T12:00:00.000Z",
        dueSet: false,
      },
    };

    const params = serializeQuery(next, base);
    expect(params.get("dueBefore")).toBe("2026-02-01T12:00:00.000Z");
    expect(params.get("due")).toBe("empty");
    expect(roundTrip(next).filters.dueSet).toBe(false);
  });

  it("round-trips visible columns", () => {
    const next = { ...base, visibleColumns: ["title", "status", "assignee"] };

    expect(serializeQuery(next, base).get("cols")).toBe(
      "title,status,assignee",
    );
    expect(roundTrip(next).visibleColumns).toEqual([
      "title",
      "status",
      "assignee",
    ]);
  });

  it("writes no column param when the columns match the base", () => {
    expect(serializeQuery({ ...base }, base).get("cols")).toBeNull();
    expect(sameQuery({ ...base }, base)).toBe(true);
  });

  it("keeps the base columns when the URL says nothing about them", () => {
    const parsed = parseQuery(new URLSearchParams("group=priority"), base);
    expect(parsed.visibleColumns).toEqual(base.visibleColumns);
  });

  it("round-trips show-archived and clears it explicitly", () => {
    const shown = {
      ...base,
      filters: { ...base.filters, includeArchived: true },
    };

    expect(serializeQuery(shown, base).get("archived")).toBe("1");
    expect(roundTrip(shown).filters.includeArchived).toBe(true);

    // Turning it back off must erase it, not fall back to the base value.
    const cleared = parseQuery(new URLSearchParams("archived=0"), shown);
    expect(cleared.filters.includeArchived).toBeUndefined();
  });

  it("preserves the issue overlay param when view state changes", () => {
    const current = new URLSearchParams("issue=ENG-16&layout=board");
    const merged = mergeViewParams(
      current,
      serializeQuery({ ...base, grouping: "priority" }, base),
    );

    expect(merged.get("issue")).toBe("ENG-16");
    expect(merged.get("group")).toBe("priority");
    expect(merged.get("layout")).toBeNull();
  });
});
