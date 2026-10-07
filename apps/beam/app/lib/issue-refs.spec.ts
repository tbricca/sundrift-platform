import { describe, expect, it } from "vitest";

import { issueRefsIn, tokenizeIssueRefs } from "./issue-refs";

const KEYS = ["ENG", "PROD"];

const refs = (text: string) =>
  tokenizeIssueRefs(text, KEYS)
    .filter((token) => token.type === "issueRef")
    .map((token) => (token as { identifier: string }).identifier);

describe("tokenizeIssueRefs", () => {
  it("splits a reference out of surrounding text", () => {
    expect(tokenizeIssueRefs("see ENG-42 first", KEYS)).toEqual([
      { type: "text", value: "see " },
      { type: "issueRef", identifier: "ENG-42", teamKey: "ENG", number: 42 },
      { type: "text", value: " first" },
    ]);
  });

  it("finds several references", () => {
    expect(refs("ENG-1 blocks PROD-2")).toEqual(["ENG-1", "PROD-2"]);
  });

  it("matches a lowercase identifier, since Beam routes accept one", () => {
    expect(refs("fixed in eng-7")).toEqual(["ENG-7"]);
  });

  it("ignores a prefix that is not a team key", () => {
    expect(refs("COVID-19 and UTF-8 and ABC-1")).toEqual([]);
  });

  it("ignores references inside inline code", () => {
    expect(refs("use `ENG-42` literally")).toEqual([]);
  });

  it("ignores references inside a fenced block", () => {
    expect(refs("```\nENG-42\n```")).toEqual([]);
  });

  it("still finds a reference after a code span", () => {
    expect(refs("`x` then ENG-9")).toEqual(["ENG-9"]);
  });

  it("ignores an identifier inside a URL", () => {
    expect(refs("https://beam.dev/issue/ENG-42")).toEqual([]);
  });

  it("finds a reference next to, but outside, a URL", () => {
    expect(refs("https://example.com/a see ENG-3")).toEqual(["ENG-3"]);
  });

  it("does not match inside a longer word", () => {
    expect(refs("XENG-42 and ENG-42x")).toEqual([]);
  });

  it("handles punctuation around the reference", () => {
    expect(refs("(ENG-42), ENG-43.")).toEqual(["ENG-42", "ENG-43"]);
  });

  it("returns plain text when the workspace has no teams", () => {
    expect(tokenizeIssueRefs("ENG-42", [])).toEqual([
      { type: "text", value: "ENG-42" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(tokenizeIssueRefs("", KEYS)).toEqual([]);
  });
});

describe("issueRefsIn", () => {
  it("deduplicates and keeps first-seen order", () => {
    expect(issueRefsIn("PROD-2 then ENG-1 then PROD-2", KEYS)).toEqual([
      "PROD-2",
      "ENG-1",
    ]);
  });
});
