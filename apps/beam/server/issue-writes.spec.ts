import { describe, expect, it } from "vitest";

import { issueWritePolicy, lostVersionRace } from "./issue-writes";

const live = { deletedAt: null };
const deleted = { deletedAt: new Date("2024-05-01T00:00:00Z") };

describe("issueWritePolicy", () => {
  it("allows ordinary writes to a live issue", () => {
    expect(issueWritePolicy(live, { title: "new" } as never)).toEqual({
      reject: null,
      guardVersion: false,
    });
  });

  it("rejects ordinary property writes to a deleted issue", () => {
    const policy = issueWritePolicy(deleted, {});
    expect(policy.reject).toMatch(/deleted/i);
  });

  it("rejects re-deleting an already deleted issue", () => {
    expect(issueWritePolicy(deleted, { deleted: true }).reject).not.toBeNull();
  });

  it("lets the restore path through", () => {
    expect(issueWritePolicy(deleted, { deleted: false }).reject).toBeNull();
  });

  it("still guards the version while restoring", () => {
    const policy = issueWritePolicy(deleted, {
      deleted: false,
      expectedVersion: 4,
    });
    expect(policy).toEqual({ reject: null, guardVersion: true });
  });

  it("guards the write only when the caller states a version", () => {
    expect(issueWritePolicy(live, {}).guardVersion).toBe(false);
    expect(issueWritePolicy(live, { expectedVersion: 0 }).guardVersion).toBe(
      true,
    );
    expect(issueWritePolicy(live, { expectedVersion: 9 }).guardVersion).toBe(
      true,
    );
  });
});

describe("lostVersionRace", () => {
  const guarded = { reject: null, guardVersion: true };
  const unguarded = { reject: null, guardVersion: false };

  it("reports a conflict when a guarded write matches no rows", () => {
    expect(lostVersionRace(0, guarded)).toBe(true);
  });

  it("is satisfied when the guarded write lands", () => {
    expect(lostVersionRace(1, guarded)).toBe(false);
  });

  it("never reports a conflict for callers that omitted the version", () => {
    // Unversioned writers keep last-write-wins; a no-op update is not an error
    // for them.
    expect(lostVersionRace(0, unguarded)).toBe(false);
    expect(lostVersionRace(1, unguarded)).toBe(false);
  });
});
