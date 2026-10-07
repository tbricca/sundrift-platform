import { describe, expect, it } from "vitest";

import {
  MIN_COMMENT_QUERY,
  MIN_TEXT_QUERY,
  parseIdentifierQuery,
  rankBy,
  scoreIssue,
  scoreText,
  type IssueCandidate,
} from "./search-rank";

function issue(
  identifier: string,
  title: string,
  extra: Partial<IssueCandidate> = {},
): IssueCandidate {
  return { identifier, title, description: null, ...extra };
}

const rankIssues = (candidates: IssueCandidate[], query: string) =>
  rankBy(candidates, (candidate) => scoreIssue(candidate, query)).map(
    (candidate) => candidate.identifier,
  );

describe("parseIdentifierQuery", () => {
  it("reads team and number from the usual spellings", () => {
    expect(parseIdentifierQuery("ENG-42")).toEqual({
      teamKey: "ENG",
      number: 42,
    });
    expect(parseIdentifierQuery("eng 42")).toEqual({
      teamKey: "ENG",
      number: 42,
    });
    expect(parseIdentifierQuery("42")).toEqual({ teamKey: null, number: 42 });
  });

  it("ignores free text", () => {
    expect(parseIdentifierQuery("board columns")).toBeNull();
    expect(parseIdentifierQuery("")).toBeNull();
  });
});

describe("scoreIssue", () => {
  it("ranks an exact identifier first", () => {
    const ranked = rankIssues(
      [
        issue("ENG-4", "Something about ENG-42"),
        issue("ENG-420", "Later issue"),
        issue("ENG-42", "The one"),
      ],
      "ENG-42",
    );
    expect(ranked[0]).toBe("ENG-42");
  });

  it("ranks identifier prefixes below the exact match", () => {
    const ranked = rankIssues(
      [issue("ENG-14", "Fourteen"), issue("ENG-1", "One")],
      "ENG-1",
    );
    expect(ranked).toEqual(["ENG-1", "ENG-14"]);
  });

  it("finds an issue from a bare number", () => {
    const ranked = rankIssues(
      [issue("ENG-7", "Seven"), issue("ENG-42", "Forty two")],
      "42",
    );
    expect(ranked).toEqual(["ENG-42"]);
  });

  it("prefers title prefix over title substring", () => {
    const ranked = rankIssues(
      [
        issue("ENG-2", "Improve the ranking of results"),
        issue("ENG-1", "Ranking needs work"),
      ],
      "ranking",
    );
    expect(ranked).toEqual(["ENG-1", "ENG-2"]);
  });

  it("puts description matches under title matches", () => {
    const ranked = rankIssues(
      [
        issue("ENG-2", "Unrelated", { description: "mentions dark mode" }),
        issue("ENG-1", "Dark mode contrast"),
      ],
      "dark mode",
    );
    expect(ranked).toEqual(["ENG-1", "ENG-2"]);
  });

  it("puts comment-only matches last", () => {
    const ranked = rankIssues(
      [
        issue("ENG-2", "Unrelated", { commentMatched: true }),
        issue("ENG-1", "Unrelated", { description: "flaky retry" }),
      ],
      "flaky",
    );
    expect(ranked).toEqual(["ENG-1", "ENG-2"]);
  });

  it("drops rows that only the SQL net matched", () => {
    expect(rankIssues([issue("ENG-1", "Nothing alike")], "zzz")).toEqual([]);
  });
});

describe("scoreText", () => {
  it("orders exact, prefix, word boundary, then substring", () => {
    const query = "sync";
    expect(scoreText("Sync", query)).toBeGreaterThan(
      scoreText("Sync revamp", query),
    );
    expect(scoreText("Sync revamp", query)).toBeGreaterThan(
      scoreText("Realtime sync", query),
    );
    expect(scoreText("Realtime sync", query)).toBeGreaterThan(
      scoreText("Resyncing", query),
    );
    expect(scoreText("nothing", query)).toBe(0);
    expect(scoreText(null, query)).toBe(0);
  });
});

describe("rankBy", () => {
  it("breaks score ties with recency", () => {
    const rows = [
      { id: "old", updatedAt: "2026-01-01T00:00:00.000Z" },
      { id: "new", updatedAt: "2026-06-01T00:00:00.000Z" },
    ];
    const ranked = rankBy(
      rows,
      () => 100,
      (row) => row.updatedAt,
    );
    expect(ranked.map((row) => row.id)).toEqual(["new", "old"]);
  });

  it("keeps broad text and comment search off very short queries", () => {
    expect(MIN_TEXT_QUERY).toBeGreaterThan(1);
    expect(MIN_COMMENT_QUERY).toBeGreaterThanOrEqual(MIN_TEXT_QUERY);
  });
});
