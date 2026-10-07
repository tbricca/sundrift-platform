import { describe, expect, it } from "vitest";

import {
  describeSchedule,
  formatTimeOfDay,
  instantFromZoned,
  isValidTimeZone,
  nextOccurrence,
  zonedParts,
  type Schedule,
} from "./recurrence";

const LA = "America/Los_Angeles";
const UTC = "UTC";
const TOKYO = "Asia/Tokyo";

/** A schedule with sensible defaults, so each test states only what it varies. */
const schedule = (overrides: Partial<Schedule> = {}): Schedule => ({
  cadence: "daily",
  interval: 1,
  timeOfDay: "09:00",
  timeZone: UTC,
  startsAt: new Date("2026-03-01T00:00:00.000Z"),
  endsAt: null,
  ...overrides,
});

const next = (overrides: Partial<Schedule>, after: string) =>
  nextOccurrence(schedule(overrides), new Date(after));

/* -------------------------------------------------------------------------- */

describe("time zone conversion", () => {
  it("reads the wall clock in a zone", () => {
    const parts = zonedParts(new Date("2026-03-10T17:30:00.000Z"), LA);

    expect(parts.year).toBe(2026);
    expect(parts.month).toBe(3);
    expect(parts.day).toBe(10);
    expect(parts.hour).toBe(10); // PDT, UTC-7
    expect(parts.minute).toBe(30);
  });

  it("reads midnight as hour zero, not twenty-four", () => {
    // January, so Los Angeles is on standard time and 08:00Z is exactly midnight.
    expect(zonedParts(new Date("2026-01-10T08:00:00.000Z"), LA).hour).toBe(0);
  });

  it("round-trips a wall clock back to the same instant", () => {
    const instant = instantFromZoned(
      { year: 2026, month: 7, day: 4, hour: 9, minute: 0 },
      LA,
    );

    expect(instant.toISOString()).toBe("2026-07-04T16:00:00.000Z"); // PDT
    expect(zonedParts(instant, LA).hour).toBe(9);
  });

  it("handles a zone ahead of UTC", () => {
    const instant = instantFromZoned(
      { year: 2026, month: 1, day: 15, hour: 9, minute: 0 },
      TOKYO,
    );

    expect(instant.toISOString()).toBe("2026-01-15T00:00:00.000Z");
  });

  it("recognises real zones and rejects nonsense", () => {
    expect(isValidTimeZone(LA)).toBe(true);
    expect(isValidTimeZone("Mars/Olympus_Mons")).toBe(false);
  });
});

describe("daylight saving", () => {
  // US DST 2026: forward 8 March, back 1 November.
  it("keeps a 9 AM rule at 9 AM local across spring forward", () => {
    const before = instantFromZoned(
      { year: 2026, month: 3, day: 7, hour: 9, minute: 0 },
      LA,
    );
    const after = instantFromZoned(
      { year: 2026, month: 3, day: 9, hour: 9, minute: 0 },
      LA,
    );

    expect(before.toISOString()).toBe("2026-03-07T17:00:00.000Z"); // PST, UTC-8
    expect(after.toISOString()).toBe("2026-03-09T16:00:00.000Z"); // PDT, UTC-7
    expect(zonedParts(before, LA).hour).toBe(9);
    expect(zonedParts(after, LA).hour).toBe(9);
  });

  it("keeps a 9 AM rule at 9 AM local across fall back", () => {
    const before = instantFromZoned(
      { year: 2026, month: 10, day: 31, hour: 9, minute: 0 },
      LA,
    );
    const after = instantFromZoned(
      { year: 2026, month: 11, day: 2, hour: 9, minute: 0 },
      LA,
    );

    expect(before.toISOString()).toBe("2026-10-31T16:00:00.000Z"); // PDT
    expect(after.toISOString()).toBe("2026-11-02T17:00:00.000Z"); // PST
    expect(zonedParts(after, LA).hour).toBe(9);
  });

  it("does not skip a day when the wall time falls in the spring-forward gap", () => {
    // 2:30 AM never happens on 8 March 2026 in Los Angeles.
    const instant = instantFromZoned(
      { year: 2026, month: 3, day: 8, hour: 2, minute: 30 },
      LA,
    );
    const local = zonedParts(instant, LA);

    expect(local.day).toBe(8);
    expect(local.hour).toBe(3); // pushed to the first instant after the gap
  });

  it("takes the earlier of the two passes through an ambiguous fall-back hour", () => {
    // 1:30 AM happens twice on 1 November 2026 in Los Angeles.
    const instant = instantFromZoned(
      { year: 2026, month: 11, day: 1, hour: 1, minute: 30 },
      LA,
    );

    expect(instant.toISOString()).toBe("2026-11-01T08:30:00.000Z"); // PDT, the first
    expect(zonedParts(instant, LA).hour).toBe(1);
  });

  it("advances a daily rule across a DST boundary without drifting", () => {
    const daily = schedule({
      timeZone: LA,
      timeOfDay: "09:00",
      startsAt: new Date("2026-03-01T00:00:00.000Z"),
    });

    const beforeChange = nextOccurrence(daily, new Date("2026-03-06T18:00:00Z"));
    const afterChange = nextOccurrence(daily, new Date("2026-03-08T18:00:00Z"));

    expect(zonedParts(beforeChange!, LA).hour).toBe(9);
    expect(zonedParts(afterChange!, LA).hour).toBe(9);
    // The UTC instant shifts by an hour; the local time does not.
    expect(beforeChange!.toISOString()).toBe("2026-03-07T17:00:00.000Z");
    expect(afterChange!.toISOString()).toBe("2026-03-09T16:00:00.000Z");
  });
});

describe("daily cadence", () => {
  it("fires the next day when today is already past", () => {
    expect(next({}, "2026-03-05T10:00:00Z")?.toISOString()).toBe(
      "2026-03-06T09:00:00.000Z",
    );
  });

  it("fires later the same day when the time has not passed", () => {
    expect(next({}, "2026-03-05T07:00:00Z")?.toISOString()).toBe(
      "2026-03-05T09:00:00.000Z",
    );
  });

  it("honours an interval of several days", () => {
    const every3 = {
      interval: 3,
      startsAt: new Date("2026-03-02T00:00:00.000Z"),
    };

    expect(next(every3, "2026-03-02T10:00:00Z")?.toISOString()).toBe(
      "2026-03-05T09:00:00.000Z",
    );
    expect(next(every3, "2026-03-05T10:00:00Z")?.toISOString()).toBe(
      "2026-03-08T09:00:00.000Z",
    );
  });

  it("always moves strictly forward when fed its own result", () => {
    let cursor = new Date("2026-03-01T00:00:00.000Z");
    for (let index = 0; index < 5; index += 1) {
      const occurrence = nextOccurrence(schedule(), cursor);
      expect(occurrence!.getTime()).toBeGreaterThan(cursor.getTime());
      cursor = occurrence!;
    }
    expect(cursor.toISOString()).toBe("2026-03-05T09:00:00.000Z");
  });
});

describe("weekly cadence", () => {
  it("fires on the chosen weekday", () => {
    // 2026-03-01 is a Sunday; the first Monday after is the 2nd.
    const monday = { cadence: "weekly" as const, weekdays: [1] };

    expect(next(monday, "2026-03-01T00:00:00Z")?.toISOString()).toBe(
      "2026-03-02T09:00:00.000Z",
    );
  });

  it("supports several weekdays in one rule", () => {
    const monWedFri = { cadence: "weekly" as const, weekdays: [1, 3, 5] };

    expect(next(monWedFri, "2026-03-02T10:00:00Z")?.toISOString()).toBe(
      "2026-03-04T09:00:00.000Z",
    );
    expect(next(monWedFri, "2026-03-04T10:00:00Z")?.toISOString()).toBe(
      "2026-03-06T09:00:00.000Z",
    );
  });

  it("skips a week when the interval is two", () => {
    const fortnightly = {
      cadence: "weekly" as const,
      weekdays: [5],
      interval: 2,
      startsAt: new Date("2026-03-02T00:00:00.000Z"), // Monday
    };

    expect(next(fortnightly, "2026-03-02T00:00:00Z")?.toISOString()).toBe(
      "2026-03-06T09:00:00.000Z",
    );
    // The following Friday is in an odd week, so it is skipped.
    expect(next(fortnightly, "2026-03-06T10:00:00Z")?.toISOString()).toBe(
      "2026-03-20T09:00:00.000Z",
    );
  });

  it("falls back to the start date's weekday when none is chosen", () => {
    const weekly = {
      cadence: "weekly" as const,
      weekdays: [],
      startsAt: new Date("2026-03-04T00:00:00.000Z"), // Wednesday
    };

    const occurrence = next(weekly, "2026-03-04T10:00:00Z");
    expect(occurrence?.getUTCDay()).toBe(3);
    expect(occurrence?.toISOString()).toBe("2026-03-11T09:00:00.000Z");
  });
});

describe("monthly cadence", () => {
  it("fires on the chosen day of the month", () => {
    const first = { cadence: "monthly" as const, dayOfMonth: 1 };

    expect(next(first, "2026-03-05T00:00:00Z")?.toISOString()).toBe(
      "2026-04-01T09:00:00.000Z",
    );
  });

  it("clamps to the last day of a short month", () => {
    const thirtyFirst = {
      cadence: "monthly" as const,
      dayOfMonth: 31,
      startsAt: new Date("2026-01-31T00:00:00.000Z"),
    };

    // February 2026 has 28 days, so the rule fires on the 28th.
    expect(next(thirtyFirst, "2026-02-01T00:00:00Z")?.toISOString()).toBe(
      "2026-02-28T09:00:00.000Z",
    );
    // April has 30, so the 30th.
    expect(next(thirtyFirst, "2026-04-01T00:00:00Z")?.toISOString()).toBe(
      "2026-04-30T09:00:00.000Z",
    );
  });

  it("honours a multi-month interval", () => {
    const quarterly = {
      cadence: "monthly" as const,
      dayOfMonth: 15,
      interval: 3,
      startsAt: new Date("2026-01-15T00:00:00.000Z"),
    };

    expect(next(quarterly, "2026-01-16T00:00:00Z")?.toISOString()).toBe(
      "2026-04-15T09:00:00.000Z",
    );
  });
});

describe("boundaries", () => {
  it("never fires before the start date", () => {
    const future = { startsAt: new Date("2026-06-01T00:00:00.000Z") };

    expect(next(future, "2026-03-01T00:00:00Z")?.toISOString()).toBe(
      "2026-06-01T09:00:00.000Z",
    );
  });

  it("stops once the end date has passed", () => {
    const ending = {
      startsAt: new Date("2026-03-01T00:00:00.000Z"),
      endsAt: new Date("2026-03-04T00:00:00.000Z"),
    };

    expect(next(ending, "2026-03-02T10:00:00Z")?.toISOString()).toBe(
      "2026-03-03T09:00:00.000Z",
    );
    expect(next(ending, "2026-03-03T10:00:00Z")).toBeNull();
  });

  it("returns the occurrence falling exactly on the end instant", () => {
    const ending = {
      endsAt: new Date("2026-03-06T09:00:00.000Z"),
    };

    expect(next(ending, "2026-03-05T10:00:00Z")?.toISOString()).toBe(
      "2026-03-06T09:00:00.000Z",
    );
  });

  it("respects the schedule's own time zone when deciding the day", () => {
    // 08:00 UTC on 5 March is still 4 March in Los Angeles, so a 9 AM LA rule
    // fires later that same local day.
    const la = { timeZone: LA, startsAt: new Date("2026-03-01T00:00:00.000Z") };

    expect(next(la, "2026-03-05T08:00:00Z")?.toISOString()).toBe(
      "2026-03-05T17:00:00.000Z",
    );
  });
});

describe("describeSchedule", () => {
  it("describes daily rules", () => {
    expect(
      describeSchedule({
        cadence: "daily",
        interval: 1,
        timeOfDay: "09:00",
        weekdays: null,
        dayOfMonth: null,
      }),
    ).toBe("Every day at 9:00 AM");

    expect(
      describeSchedule({
        cadence: "daily",
        interval: 3,
        timeOfDay: "17:30",
        weekdays: null,
        dayOfMonth: null,
      }),
    ).toBe("Every 3 days at 5:30 PM");
  });

  it("collapses Monday to Friday into 'every weekday'", () => {
    expect(
      describeSchedule({
        cadence: "weekly",
        interval: 1,
        weekdays: [1, 2, 3, 4, 5],
        dayOfMonth: null,
        timeOfDay: "09:00",
      }),
    ).toBe("Every weekday at 9:00 AM");
  });

  it("names a single weekday", () => {
    expect(
      describeSchedule({
        cadence: "weekly",
        interval: 1,
        weekdays: [1],
        dayOfMonth: null,
        timeOfDay: "10:00",
      }),
    ).toBe("Every Monday at 10:00 AM");
  });

  it("describes a multi-week interval", () => {
    expect(
      describeSchedule({
        cadence: "weekly",
        interval: 2,
        weekdays: [5],
        dayOfMonth: null,
        timeOfDay: "15:00",
      }),
    ).toBe("Every 2 weeks on Friday at 3:00 PM");
  });

  it("lists several weekdays", () => {
    expect(
      describeSchedule({
        cadence: "weekly",
        interval: 1,
        weekdays: [1, 3],
        dayOfMonth: null,
        timeOfDay: "09:00",
      }),
    ).toBe("Every week on Monday and Wednesday at 9:00 AM");
  });

  it("describes monthly rules with an ordinal", () => {
    expect(
      describeSchedule({
        cadence: "monthly",
        interval: 1,
        weekdays: null,
        dayOfMonth: 1,
        timeOfDay: "08:00",
      }),
    ).toBe("Monthly on the 1st at 8:00 AM");

    expect(
      describeSchedule({
        cadence: "monthly",
        interval: 1,
        weekdays: null,
        dayOfMonth: 22,
        timeOfDay: "08:00",
      }),
    ).toBe("Monthly on the 22nd at 8:00 AM");

    expect(
      describeSchedule({
        cadence: "monthly",
        interval: 3,
        weekdays: null,
        dayOfMonth: 3,
        timeOfDay: "08:00",
      }),
    ).toBe("Every 3 months on the 3rd at 8:00 AM");
  });

  it("uses th for the teens", () => {
    for (const day of [11, 12, 13]) {
      expect(
        describeSchedule({
          cadence: "monthly",
          interval: 1,
          weekdays: null,
          dayOfMonth: day,
          timeOfDay: "08:00",
        }),
      ).toBe(`Monthly on the ${day}th at 8:00 AM`);
    }
  });
});

describe("formatTimeOfDay", () => {
  it("formats midnight and noon unambiguously", () => {
    expect(formatTimeOfDay("00:00")).toBe("12:00 AM");
    expect(formatTimeOfDay("12:00")).toBe("12:00 PM");
  });

  it("formats morning and afternoon", () => {
    expect(formatTimeOfDay("09:05")).toBe("9:05 AM");
    expect(formatTimeOfDay("23:59")).toBe("11:59 PM");
  });
});
