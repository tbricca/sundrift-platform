import { describe, expect, it } from "vitest";

import {
  DEFAULT_RANGE,
  NO_DATA,
  compareTo,
  formatBucket,
  formatCommitted,
  formatCount,
  formatDuration,
  formatPercent,
  formatScopeChange,
  granularityFor,
  parseRange,
  resolveRange,
} from "./analytics";

const NOW = new Date("2026-03-15T12:00:00.000Z");

describe("parseRange", () => {
  it("accepts the supported ranges", () => {
    expect(parseRange("7d")).toBe("7d");
    expect(parseRange("30d")).toBe("30d");
    expect(parseRange("90d")).toBe("90d");
  });

  it("falls back to the default rather than throwing", () => {
    expect(parseRange(null)).toBe(DEFAULT_RANGE);
    expect(parseRange(undefined)).toBe(DEFAULT_RANGE);
    expect(parseRange("")).toBe(DEFAULT_RANGE);
    expect(parseRange("all-time")).toBe(DEFAULT_RANGE);
    expect(parseRange("7")).toBe(DEFAULT_RANGE);
  });
});

describe("granularityFor", () => {
  it("keeps short ranges daily and switches a quarter to weekly", () => {
    expect(granularityFor("7d")).toBe("day");
    expect(granularityFor("30d")).toBe("day");
    expect(granularityFor("90d")).toBe("week");
  });
});

describe("resolveRange", () => {
  it("covers whole UTC days ending with today", () => {
    const range = resolveRange("7d", NOW);

    expect(range.start.toISOString()).toBe("2026-03-09T00:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-03-16T00:00:00.000Z");
    expect(range.granularity).toBe("day");
  });

  it("spans exactly as many days as the range names", () => {
    const day = 86_400_000;
    for (const [range, days] of [
      ["7d", 7],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      const { start, end } = resolveRange(range, NOW);
      expect((end.getTime() - start.getTime()) / day).toBe(days);
    }
  });

  it("is unaffected by the time of day", () => {
    const morning = resolveRange("30d", new Date("2026-03-15T00:00:01.000Z"));
    const midnight = resolveRange("30d", new Date("2026-03-15T23:59:59.000Z"));

    expect(morning).toEqual(midnight);
  });

  it("carries the granularity for the range", () => {
    expect(resolveRange("90d", NOW).granularity).toBe("week");
  });
});

describe("formatDuration", () => {
  it("reports no data instead of zero when there is nothing to measure", () => {
    expect(formatDuration(null)).toBe(NO_DATA);
    expect(formatDuration(undefined)).toBe(NO_DATA);
  });

  it("collapses sub-minute durations", () => {
    expect(formatDuration(0)).toBe("< 1m");
    expect(formatDuration(59)).toBe("< 1m");
  });

  it("uses minutes, hours, days and weeks as the value grows", () => {
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(45 * 60)).toBe("45m");
    expect(formatDuration(3 * 3600)).toBe("3h");
    expect(formatDuration(23 * 3600)).toBe("23h");
    expect(formatDuration(2 * 86400)).toBe("2d");
    expect(formatDuration(30 * 86400)).toBe("30d");
    expect(formatDuration(84 * 86400)).toBe("12w");
  });

  it("keeps one decimal only when it carries information", () => {
    expect(formatDuration(2.5 * 86400)).toBe("2.5d");
    expect(formatDuration(3 * 86400)).toBe("3d");
  });
});

describe("formatPercent and formatCount", () => {
  it("renders a dash for absent values, not a zero", () => {
    expect(formatPercent(null)).toBe(NO_DATA);
    expect(formatCount(null)).toBe(NO_DATA);
  });

  it("renders real zeros as zero", () => {
    expect(formatPercent(0)).toBe("0%");
    expect(formatCount(0)).toBe("0");
  });

  it("formats ordinary values", () => {
    expect(formatPercent(83)).toBe("83%");
    expect(formatCount(1234)).toBe("1,234");
  });
});

describe("compareTo", () => {
  it("returns nothing when there is no previous value", () => {
    expect(compareTo(18, null)).toBeNull();
    expect(compareTo(18, undefined)).toBeNull();
  });

  it("describes an increase", () => {
    const result = compareTo(18, 15);
    expect(result).toEqual({
      delta: 3,
      direction: "up",
      label: "+3 vs previous",
    });
  });

  it("describes a decrease with a proper minus sign", () => {
    const result = compareTo(12, 15);
    expect(result?.delta).toBe(-3);
    expect(result?.direction).toBe("down");
    expect(result?.label).toBe("−3 vs previous");
  });

  it("says no change rather than +0", () => {
    expect(compareTo(15, 15)).toEqual({
      delta: 0,
      direction: "flat",
      label: "no change vs previous",
    });
  });

  it("takes a custom noun", () => {
    expect(compareTo(4, 1, "last cycle")?.label).toBe("+3 vs last cycle");
  });

  it("compares against a previous zero", () => {
    expect(compareTo(5, 0)?.label).toBe("+5 vs previous");
  });
});

describe("formatBucket", () => {
  it("labels a day bucket", () => {
    expect(formatBucket("2026-03-12", "day")).toBe("12 Mar");
  });

  it("marks a week bucket as a week commencing", () => {
    expect(formatBucket("2026-03-09", "week")).toBe("w/c 9 Mar");
  });

  it("passes through anything unparseable", () => {
    expect(formatBucket("not-a-date", "day")).toBe("not-a-date");
  });
});

describe("formatCommitted", () => {
  it("reads as completed over the original commitment", () => {
    expect(formatCommitted(15, 20)).toBe("15/20");
  });

  it("has nothing to say when nothing was committed", () => {
    expect(formatCommitted(0, 0)).toBe(NO_DATA);
  });
});

describe("formatScopeChange", () => {
  it("shows additions and removals separately, never netted", () => {
    expect(formatScopeChange(4, 2)).toBe("+4 \u22122");
  });

  it("shows only the side that moved", () => {
    expect(formatScopeChange(3, 0)).toBe("+3");
    expect(formatScopeChange(0, 1)).toBe("\u22121");
  });

  it("says nothing at all when scope held still", () => {
    expect(formatScopeChange(0, 0)).toBeNull();
  });
});
