import { describe, expect, it } from "vitest";

import {
  activeMentionQuery,
  encodeMention,
  parseMentionIds,
  stripMentions,
  tokenizeMentions,
} from "./mentions";

describe("mentions", () => {
  it("round-trips a member id through the inline encoding", () => {
    const text = `Ping ${encodeMention("m1", "Ana Reyes")} please`;
    expect(parseMentionIds(text)).toEqual(["m1"]);
    expect(stripMentions(text)).toBe("Ping @Ana Reyes please");
  });

  it("keeps the id association when the display name changes", () => {
    // The stored name is stale but the id is what notifications will use.
    const text = encodeMention("m9", "Old Name");
    expect(parseMentionIds(text)).toEqual(["m9"]);
  });

  it("de-duplicates repeated mentions of the same member", () => {
    const text = `${encodeMention("m1", "Ana")} and ${encodeMention("m1", "Ana")}`;
    expect(parseMentionIds(text)).toEqual(["m1"]);
  });

  it("tokenizes text and mentions in order", () => {
    const tokens = tokenizeMentions(`hi ${encodeMention("m2", "Tom")}!`);
    expect(tokens).toEqual([
      { type: "text", value: "hi " },
      { type: "mention", label: "Tom", memberId: "m2" },
      { type: "text", value: "!" },
    ]);
  });

  it("detects an in-progress mention at the caret", () => {
    const value = "ping @an";
    expect(activeMentionQuery(value, value.length)).toEqual({
      query: "an",
      start: 5,
    });
  });

  it("ignores an @ that is part of a word such as an email", () => {
    const value = "mail ana@northwind.test";
    expect(activeMentionQuery(value, value.length)).toBeNull();
  });

  it("stops offering autocomplete once the mention is complete", () => {
    const value = `${encodeMention("m1", "Ana")} `;
    expect(activeMentionQuery(value, value.length)).toBeNull();
  });
});
