import { describe, expect, it } from "vitest";

import {
  actorList,
  bucketOf,
  groupCompatible,
  groupCopy,
  groupNotificationIds,
  inboxSections,
  notificationCopy,
} from "./notification-copy";
import type { NotificationItem } from "./types";

function make(partial: Partial<NotificationItem>): NotificationItem {
  return {
    id: "n1",
    type: "issue_assigned",
    entityType: "issue",
    entityId: "i1",
    metadata: { issueIdentifier: "ENG-42", issueTitle: "Improve ranking" },
    readAt: null,
    createdAt: new Date().toISOString(),
    actor: { id: "m1", name: "Priya Shah", kind: "human", avatarUrl: null },
    ...partial,
  };
}

describe("notificationCopy", () => {
  it("renders an assignment from type and metadata", () => {
    const copy = notificationCopy(make({}));
    expect(copy.text).toBe("Priya Shah assigned ENG-42 to you");
    expect(copy.detail).toBe("Improve ranking");
    expect(copy.href).toBe("/issue/ENG-42");
  });

  it("marks mentions so the Inbox can filter them", () => {
    expect(notificationCopy(make({ type: "issue_mention" })).isMention).toBe(
      true,
    );
    expect(notificationCopy(make({ type: "comment_mention" })).isMention).toBe(
      true,
    );
    expect(notificationCopy(make({ type: "issue_comment" })).isMention).toBe(
      false,
    );
  });

  it("names an agent actor exactly like a human", () => {
    const copy = notificationCopy(
      make({
        type: "comment_mention",
        actor: {
          id: "a1",
          name: "Triage Agent",
          kind: "agent",
          avatarUrl: null,
        },
        metadata: { issueIdentifier: "ENG-51", excerpt: "Taking a look" },
      }),
    );
    expect(copy.text).toBe("Triage Agent mentioned you in a comment on ENG-51");
    expect(copy.detail).toBe("Taking a look");
  });

  it("falls back to Beam for system events", () => {
    const copy = notificationCopy(make({ actor: null, metadata: {} }));
    expect(copy.text.startsWith("Beam ")).toBe(true);
  });

  it("renders a project update with its health", () => {
    const copy = notificationCopy(
      make({
        type: "project_update",
        entityType: "project",
        entityId: "p1",
        metadata: { projectName: "Search Revamp", projectHealth: "at_risk" },
      }),
    );
    expect(copy.text).toBe(
      "Priya Shah posted an update to Search Revamp — At risk",
    );
    expect(copy.href).toBe("/projects/p1/updates");
  });
});

describe("grouping", () => {
  const now = new Date("2026-03-10T12:00:00Z");

  it("buckets by calendar day", () => {
    expect(bucketOf("2026-03-10T08:00:00Z", now)).toBe("Today");
    expect(bucketOf("2026-03-09T23:00:00Z", now)).toBe("Yesterday");
    expect(bucketOf("2026-03-01T09:00:00Z", now)).toBe("Earlier");
  });

  it("drops empty buckets and keeps order", () => {
    const sections = inboxSections(
      [
        make({ id: "a", createdAt: "2026-03-10T09:00:00Z" }),
        make({ id: "b", createdAt: "2026-03-01T09:00:00Z" }),
      ],
      now,
    );
    expect(sections.map((section) => section.bucket)).toEqual([
      "Today",
      "Earlier",
    ]);
  });
});

function comment(
  id: string,
  actorName: string,
  createdAt: string,
  extra: Partial<NotificationItem> = {},
): NotificationItem {
  return make({
    id,
    type: "issue_comment",
    createdAt,
    actor: {
      id: `m-${actorName}`,
      name: actorName,
      kind: "human",
      avatarUrl: null,
    },
    ...extra,
  });
}

describe("groupCompatible", () => {
  it("collapses comments on the same issue within the window", () => {
    const groups = groupCompatible([
      comment("c3", "Priya", "2026-03-10T12:00:00Z"),
      comment("c2", "Tom", "2026-03-10T11:00:00Z"),
      comment("c1", "Ana", "2026-03-10T10:00:00Z"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].notifications).toHaveLength(3);
    expect(groups[0].unreadCount).toBe(3);
    expect(groups[0].latestAt).toBe("2026-03-10T12:00:00Z");
    expect(groupNotificationIds(groups[0])).toEqual(["c3", "c2", "c1"]);
  });

  it("never groups mentions or assignments", () => {
    const groups = groupCompatible([
      make({
        id: "a",
        type: "comment_mention",
        createdAt: "2026-03-10T12:00:00Z",
      }),
      make({
        id: "b",
        type: "comment_mention",
        createdAt: "2026-03-10T11:30:00Z",
      }),
      make({
        id: "c",
        type: "issue_assigned",
        createdAt: "2026-03-10T11:00:00Z",
      }),
      make({
        id: "d",
        type: "issue_assigned",
        createdAt: "2026-03-10T10:30:00Z",
      }),
    ]);
    expect(groups).toHaveLength(4);
  });

  it("keeps different issues apart", () => {
    const groups = groupCompatible([
      comment("c1", "Ana", "2026-03-10T12:00:00Z", { entityId: "i1" }),
      comment("c2", "Tom", "2026-03-10T11:00:00Z", { entityId: "i2" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("splits rows that fall outside the grouping window", () => {
    const groups = groupCompatible([
      comment("c1", "Ana", "2026-03-10T20:00:00Z"),
      comment("c2", "Tom", "2026-03-10T02:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("counts only unread notifications toward the group badge", () => {
    const groups = groupCompatible([
      comment("c1", "Ana", "2026-03-10T12:00:00Z"),
      comment("c2", "Tom", "2026-03-10T11:00:00Z", {
        readAt: "2026-03-10T11:05:00Z",
      }),
    ]);
    expect(groups[0].notifications).toHaveLength(2);
    expect(groups[0].unreadCount).toBe(1);
  });

  it("dedupes repeat actors", () => {
    const groups = groupCompatible([
      comment("c1", "Ana", "2026-03-10T12:00:00Z"),
      comment("c2", "Ana", "2026-03-10T11:00:00Z"),
    ]);
    expect(groups[0].actors).toHaveLength(1);
  });
});

describe("actorList", () => {
  it("reads naturally as it grows", () => {
    expect(actorList(["Ana"])).toBe("Ana");
    expect(actorList(["Ana", "Tom"])).toBe("Ana and Tom");
    expect(actorList(["Ana", "Tom", "Priya"])).toBe("Ana, Tom and Priya");
    expect(actorList(["Ana", "Tom", "Priya", "Marc"])).toBe(
      "Ana, Tom and 2 others",
    );
  });
});

describe("groupCopy", () => {
  it("reads exactly like before when a group holds one row", () => {
    const [group] = groupCompatible([make({})]);
    expect(groupCopy(group).text).toBe("Priya Shah assigned ENG-42 to you");
  });

  it("names the actors and counts the comments", () => {
    const [group] = groupCompatible([
      comment("c1", "Ana", "2026-03-10T12:00:00Z"),
      comment("c2", "Tom", "2026-03-10T11:00:00Z"),
    ]);
    const copy = groupCopy(group);
    expect(copy.text).toBe("Ana and Tom commented on ENG-42");
    expect(copy.detail).toBe("2 new comments");
    expect(copy.href).toBe("/issue/ENG-42");
  });

  it("counts project updates rather than naming every author", () => {
    const [group] = groupCompatible([
      make({
        id: "p1",
        type: "project_update",
        entityType: "project",
        entityId: "proj1",
        metadata: { projectName: "Search Revamp" },
        createdAt: "2026-03-10T12:00:00Z",
      }),
      make({
        id: "p2",
        type: "project_update",
        entityType: "project",
        entityId: "proj1",
        metadata: { projectName: "Search Revamp" },
        createdAt: "2026-03-10T11:00:00Z",
      }),
    ]);
    expect(groupCopy(group).text).toBe("2 new updates in Search Revamp");
    expect(groupCopy(group).href).toBe("/projects/proj1/updates");
  });
});
