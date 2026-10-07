import { describe, expect, it } from "vitest";

import {
  addWeeks,
  alignToWeekday,
  cycleDaysRemaining,
  cycleElapsedPercent,
  cycleState,
  cycleSubtitle,
} from "./cycle";

const cycle = {
  startsAt: "2026-08-03T00:00:00.000Z",
  endsAt: "2026-08-17T00:00:00.000Z",
};

const at = (iso: string) => new Date(iso).getTime();

describe("cycleState", () => {
  it("is upcoming before the start", () => {
    expect(cycleState(cycle, at("2026-08-02T23:59:59.000Z"))).toBe("upcoming");
  });

  it("is active from the start instant", () => {
    expect(cycleState(cycle, at("2026-08-03T00:00:00.000Z"))).toBe("active");
    expect(cycleState(cycle, at("2026-08-10T12:00:00.000Z"))).toBe("active");
  });

  it("completes the instant the next cycle starts, so no gap exists", () => {
    expect(cycleState(cycle, at("2026-08-17T00:00:00.000Z"))).toBe("completed");
  });
});

describe("cycle progress through time", () => {
  it("reports elapsed percentage and days left", () => {
    const now = at("2026-08-10T00:00:00.000Z");
    expect(cycleElapsedPercent(cycle, now)).toBe(50);
    expect(cycleDaysRemaining(cycle, now)).toBe(7);
  });

  it("never reports negative days on a finished cycle", () => {
    expect(cycleDaysRemaining(cycle, at("2026-09-01T00:00:00.000Z"))).toBe(0);
  });
});

describe("cycleSubtitle", () => {
  it("hides a name that only repeats the number", () => {
    expect(cycleSubtitle({ number: 12, name: "Cycle 12" })).toBeNull();
    expect(cycleSubtitle({ number: 12, name: null })).toBeNull();
  });

  it("keeps a name that adds information", () => {
    expect(cycleSubtitle({ number: 12, name: "Launch" })).toBe("Launch");
  });
});

describe("cycle boundaries", () => {
  it("aligns to the next occurrence of the start weekday", () => {
    // 2026-08-08 is a Saturday; the next Monday is the 10th.
    const start = alignToWeekday(new Date("2026-08-08T13:00:00.000Z"), 1);
    expect(start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("keeps a date that already falls on the start weekday", () => {
    const start = alignToWeekday(new Date("2026-08-10T13:00:00.000Z"), 1);
    expect(start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
  });

  it("adds whole weeks", () => {
    expect(addWeeks(new Date("2026-08-03T00:00:00.000Z"), 2).toISOString()).toBe(
      "2026-08-17T00:00:00.000Z",
    );
  });
});
