import { describe, expect, it } from "vitest";

import {
  matchResearchKeyword,
  DEMO_RESEARCH,
} from "../../../packages/shared/src/demo-catalog.ts";

describe("seo catalog matching", () => {
  it("resolves travel keywords and the linen alias", () => {
    expect(matchResearchKeyword("linen travel shirts")?.id).toBe(
      "research_linen_travel_shirts",
    );
    expect(matchResearchKeyword("linen shirts")?.keyword).toBe(
      "linen travel shirts",
    );
    expect(matchResearchKeyword("weekender bags")?.volume).toBe(12100);
    expect(matchResearchKeyword("packing cubes")?.keywordDifficulty).toBe(18);
  });

  it("does not invent a report for an unknown keyword", () => {
    expect(matchResearchKeyword("unobtainium tote")).toBeUndefined();
  });

  it("uses fictional competitors", () => {
    const names = DEMO_RESEARCH.flatMap((entry) =>
      entry.serp.map((row) => row.name),
    );
    expect(names).toContain("Harbor Supply");
    expect(names.join(" ")).not.toMatch(/away|banana republic/i);
  });
});
