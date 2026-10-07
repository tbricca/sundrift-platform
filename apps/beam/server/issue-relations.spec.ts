import { describe, expect, it } from "vitest";

import { canonicalRelation } from "./issue-writes";

describe("canonicalRelation", () => {
  it("stores blocked_by as the inverse blocks row", () => {
    expect(canonicalRelation("a", "b", "blocked_by")).toEqual({
      issueId: "b",
      relatedIssueId: "a",
      type: "blocks",
    });
  });

  it("collapses a blocks/blocked_by pair onto the same row", () => {
    expect(canonicalRelation("a", "b", "blocks")).toEqual(
      canonicalRelation("b", "a", "blocked_by"),
    );
  });

  it("orders symmetric relations so the inverse cannot duplicate", () => {
    expect(canonicalRelation("z", "a", "related")).toEqual({
      issueId: "a",
      relatedIssueId: "z",
      type: "related",
    });
    expect(canonicalRelation("a", "z", "related")).toEqual(
      canonicalRelation("z", "a", "related"),
    );
  });

  it("applies the same ordering to duplicates", () => {
    expect(canonicalRelation("b", "a", "duplicate")).toEqual(
      canonicalRelation("a", "b", "duplicate"),
    );
  });
});
