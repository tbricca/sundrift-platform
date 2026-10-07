import { describe, expect, it } from "vitest";

import {
  parseBeamEvent,
  realtimeVerdict,
  reconcileEditableText,
  reconnectTargets,
  type BeamChangeEvent,
  type RealtimeState,
} from "./realtime-events";

function state(partial: Partial<RealtimeState> = {}): RealtimeState {
  return {
    tabId: "this-tab",
    pending: new Map(),
    versions: new Map(),
    now: 1_000,
    ...partial,
  };
}

const issueEvent = (extra: Partial<BeamChangeEvent> = {}): BeamChangeEvent => ({
  entity: "issue",
  id: "i1",
  ...extra,
});

describe("parseBeamEvent", () => {
  it("reads a Beam event off the shared stream", () => {
    expect(
      parseBeamEvent({
        source: "beam",
        entity: "issue",
        id: "i1",
        issueVersion: 4,
      }),
    ).toMatchObject({ entity: "issue", id: "i1", issueVersion: 4 });
  });

  it("does not read the entity version from the change-log cursor", () => {
    // The change log stamps every event with its own `version`. Reading that
    // as the issue version would poison the ordering guard permanently.
    const parsed = parseBeamEvent({
      source: "beam",
      entity: "issue",
      id: "i1",
      version: 1_786_247_640_370,
    });
    expect(parsed?.issueVersion).toBeUndefined();
  });

  it("ignores framework and unknown events", () => {
    expect(parseBeamEvent({ source: "action", key: "update-issue" })).toBeNull();
    expect(parseBeamEvent({ source: "beam", entity: "invoice" })).toBeNull();
    expect(parseBeamEvent(null)).toBeNull();
  });
});

describe("realtimeVerdict", () => {
  it("applies a change from somebody else", () => {
    expect(realtimeVerdict(issueEvent(), state())).toBe("apply");
  });

  it("treats an event this tab caused as its own echo", () => {
    expect(
      realtimeVerdict(issueEvent({ tabId: "this-tab" }), state()),
    ).toBe("echo");
  });

  it("suppresses events while a local write is still settling", () => {
    const pending = new Map([["i1", 5_000]]);
    expect(realtimeVerdict(issueEvent(), state({ pending }))).toBe("echo");
  });

  it("stops suppressing once the settle window passes", () => {
    const pending = new Map([["i1", 500]]);
    expect(realtimeVerdict(issueEvent(), state({ pending }))).toBe("apply");
  });

  it("ignores a version older than the one already known", () => {
    const versions = new Map([["i1", 7]]);
    expect(
      realtimeVerdict(issueEvent({ issueVersion: 5 }), state({ versions })),
    ).toBe("stale");
  });

  it("ignores a repeat of the version already known", () => {
    const versions = new Map([["i1", 7]]);
    expect(
      realtimeVerdict(issueEvent({ issueVersion: 7 }), state({ versions })),
    ).toBe("stale");
  });

  it("applies a newer version", () => {
    const versions = new Map([["i1", 7]]);
    expect(
      realtimeVerdict(issueEvent({ issueVersion: 8 }), state({ versions })),
    ).toBe("apply");
  });

  it("keys comment events on their issue", () => {
    const pending = new Map([["i1", 5_000]]);
    expect(
      realtimeVerdict({ entity: "comment", issueId: "i1" }, state({ pending })),
    ).toBe("echo");
    expect(
      realtimeVerdict({ entity: "comment", issueId: "i2" }, state({ pending })),
    ).toBe("apply");
  });
});

describe("reconnectTargets", () => {
  it("always refreshes the shell counters", () => {
    expect(reconnectTargets("/settings", false)).toEqual(["inbox", "workspace"]);
  });

  it("refreshes the list on an issue surface", () => {
    expect(reconnectTargets("/team/ENG/issues", false)).toContain("issueLists");
    expect(reconnectTargets("/my-issues", false)).toContain("issueLists");
    expect(reconnectTargets("/views/v1", false)).toContain("issueLists");
  });

  it("refreshes the detail when an issue is open over the list", () => {
    expect(reconnectTargets("/team/ENG/issues", true)).toContain("issueDetail");
    expect(reconnectTargets("/issue/ENG-1", false)).toContain("issueDetail");
  });

  it("refreshes project and cycle detail where they are showing", () => {
    expect(reconnectTargets("/projects/p1", false)).toContain("project");
    expect(reconnectTargets("/team/ENG/cycles/c1", false)).toContain("cycle");
  });
});

describe("reconcileEditableText", () => {
  it("adopts the remote value when the field is untouched", () => {
    expect(reconcileEditableText("old", "old", "new")).toEqual({
      value: "new",
      stale: false,
    });
  });

  it("keeps unsaved local text and flags the pane", () => {
    expect(reconcileEditableText("my draft", "old", "new")).toEqual({
      value: "my draft",
      stale: true,
    });
  });

  it("says nothing when local text already matches the server", () => {
    expect(reconcileEditableText("same", "old", "same")).toEqual({
      value: "same",
      stale: false,
    });
  });
});
