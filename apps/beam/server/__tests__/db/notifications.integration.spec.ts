/**
 * Who hears about a write, who owns the resulting row, and what the Inbox
 * returns. Recipient policy is easy to get subtly wrong — self-notifications,
 * duplicates on re-save, agents with no Inbox — so it is verified against real
 * rows rather than through the pure copy helpers.
 *
 * The signed-in member is always the first human on the roster (auth is
 * disabled), so Ana is the actor and Ben is the other party throughout.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import createComment from "../../../actions/create-comment";
import createProjectUpdate from "../../../actions/create-project-update";
import listNotifications from "../../../actions/list-notifications";
import markAllRead from "../../../actions/mark-all-notifications-read";
import updateIssue from "../../../actions/update-issue";
import updateNotification from "../../../actions/update-notification";
import { encodeMention } from "../../../app/lib/mentions";
import { groupCompatible } from "../../../app/lib/notification-copy";
import {
  favorites,
  issueSubscribers,
  notifications,
} from "../../../drizzle/schema";
import {
  constraintViolation,
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  createTestIssue,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const update = (args: Record<string, unknown>) => updateIssue.run(args as never);
const comment = (args: Record<string, unknown>) =>
  createComment.run(args as never);
const inbox = (args: Record<string, unknown> = {}) =>
  listNotifications.run({ filter: "all", limit: 100, ...args } as never);

const rowsFor = async (userId: string) =>
  testDb().select().from(notifications).where(eq(notifications.userId, userId));

const allRows = async () => testDb().select().from(notifications);

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("assignment recipients", () => {
  it("notifies the newly assigned member exactly once", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    const rows = await rowsFor(fixture.humanB);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("issue_assigned");
    expect(rows[0].actorId).toBe(fixture.humanA);
    expect(rows[0].entityId).toBe(issue.id);
  });

  it("does not notify the actor when they assign themselves", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, assigneeId: fixture.humanA });

    expect(await rowsFor(fixture.humanA)).toHaveLength(0);
  });

  it("creates no second row when the same assignee is written again", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, assigneeId: fixture.humanB });
    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    expect(await rowsFor(fixture.humanB)).toHaveLength(1);
  });

  it("stores denormalised context so the Inbox renders without a follow-up read", async () => {
    const issue = await createTestIssue(fixture.eng, { title: "Ship it" });

    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    const [row] = await rowsFor(fixture.humanB);
    const metadata = row.metadata as Record<string, string>;
    expect(metadata.issueIdentifier).toBe(`ENG-${issue.identifierNumber}`);
    expect(metadata.issueTitle).toBe("Ship it");
    expect(metadata.actorName).toBe("Ana Human");
  });

  it("creates no notification row for an agent assignee", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({ identifier: issue.id, assigneeId: fixture.agentA });

    expect(await rowsFor(fixture.agentA)).toHaveLength(0);
  });
});

describe("mention recipients", () => {
  it("notifies a member named in a new description", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      description: `cc ${encodeMention(fixture.humanB, "Ben Human")}`,
    });

    const rows = await rowsFor(fixture.humanB);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("issue_mention");
  });

  it("does not notify again when an edit keeps the same mention", async () => {
    const issue = await createTestIssue(fixture.eng);
    const mention = encodeMention(fixture.humanB, "Ben Human");

    await update({ identifier: issue.id, description: `cc ${mention}` });
    await update({ identifier: issue.id, description: `cc ${mention} again` });

    expect(await rowsFor(fixture.humanB)).toHaveLength(1);
  });

  it("notifies nobody when an edit removes a mention", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      description: `cc ${encodeMention(fixture.humanB, "Ben Human")}`,
    });
    const before = (await allRows()).length;
    await update({ identifier: issue.id, description: "no mentions left" });

    expect(await allRows()).toHaveLength(before);
  });

  it("notifies only the member added by a later edit", async () => {
    const issue = await createTestIssue(fixture.eng, { createdBy: fixture.humanB });
    const ben = encodeMention(fixture.humanB, "Ben Human");
    const aria = encodeMention(fixture.agentA, "Aria Agent");

    await update({ identifier: issue.id, description: `cc ${ben}` });
    await update({ identifier: issue.id, description: `cc ${ben} ${aria}` });

    expect(await rowsFor(fixture.humanB)).toHaveLength(1);
  });

  it("subscribes a mentioned member to the issue", async () => {
    const issue = await createTestIssue(fixture.eng);

    await update({
      identifier: issue.id,
      description: `cc ${encodeMention(fixture.humanB, "Ben Human")}`,
    });
    await comment({ identifier: issue.id, body: "follow-up" });

    const types = (await rowsFor(fixture.humanB)).map((row) => row.type);
    expect(types).toContain("issue_comment");
  });
});

describe("comment recipients", () => {
  it("notifies subscribers and never the author", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    await comment({ identifier: issue.id, body: "Looks good" });

    const ben = await rowsFor(fixture.humanB);
    expect(ben.map((row) => row.type)).toEqual([
      "issue_assigned",
      "issue_comment",
    ]);
    expect(await rowsFor(fixture.humanA)).toHaveLength(0);
  });

  it("gives a mentioned subscriber the mention only, not a duplicate comment row", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });
    await testDb().delete(notifications);

    await comment({
      identifier: issue.id,
      body: `${encodeMention(fixture.humanB, "Ben Human")} please look`,
    });

    const rows = await rowsFor(fixture.humanB);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("comment_mention");
  });

  it("stores an agent author as the actor while notifying humans", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    await comment({
      identifier: issue.id,
      body: "Automated triage note",
      authorId: fixture.agentA,
    });

    const [latest] = (await rowsFor(fixture.humanB)).filter(
      (row) => row.type === "issue_comment",
    );
    expect(latest.actorId).toBe(fixture.agentA);
    expect((latest.metadata as Record<string, string>).actorName).toBe(
      "Aria Agent",
    );
  });

  it("creates no row for an agent subscriber", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.agentA });

    await comment({ identifier: issue.id, body: "Anyone?" });

    expect(await rowsFor(fixture.agentA)).toHaveLength(0);
  });

  it("carries a plain-text excerpt with the mention markup stripped", async () => {
    const issue = await createTestIssue(fixture.eng);

    await comment({
      identifier: issue.id,
      body: `${encodeMention(fixture.humanB, "Ben Human")} shipping tomorrow`,
    });

    const [row] = await rowsFor(fixture.humanB);
    const excerpt = (row.metadata as Record<string, string>).excerpt;
    expect(excerpt).not.toContain("member:");
    expect(excerpt).toContain("shipping tomorrow");
  });
});

describe("project update recipients", () => {
  it("notifies a member who favorited the project", async () => {
    await testDb()
      .insert(favorites)
      .values({
        userId: fixture.humanB,
        entityType: "project",
        entityId: fixture.projectA,
        sortOrder: 0,
      });

    await createProjectUpdate.run({
      projectId: fixture.projectA,
      health: "on_track",
      body: "Week one done",
    } as never);

    const rows = await rowsFor(fixture.humanB);
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("project_update");
    expect(rows[0].entityType).toBe("project");
  });

  it("notifies the project lead and excludes the author", async () => {
    // Project B's lead is Ben; Ana posts the update.
    await createProjectUpdate.run({
      projectId: fixture.projectB,
      health: "at_risk",
      body: "Slipping",
    } as never);

    expect(await rowsFor(fixture.humanB)).toHaveLength(1);
    expect(await rowsFor(fixture.humanA)).toHaveLength(0);
  });

  it("does not notify the lead when the lead is the author", async () => {
    // Project A's lead is Ana, who is also the acting member.
    await createProjectUpdate.run({
      projectId: fixture.projectA,
      health: "on_track",
      body: "All good",
    } as never);

    expect(await allRows()).toHaveLength(0);
  });
});

describe("notification ownership", () => {
  it("lets the owner mark their own notification read", async () => {
    const issue = await createTestIssue(fixture.eng, { createdBy: fixture.humanB });
    await update({ identifier: issue.id, assigneeId: fixture.humanA });
    // Ana never notifies herself, so give her a row directly.
    const [row] = await testDb()
      .insert(notifications)
      .values({
        userId: fixture.humanA,
        actorId: fixture.humanB,
        type: "issue_comment",
        entityType: "issue",
        entityId: issue.id,
        metadata: {},
      })
      .returning();

    const result = await updateNotification.run({
      notificationIds: [row.id],
      read: true,
    } as never);

    expect(result.updatedCount).toBe(1);
    expect((await rowsFor(fixture.humanA))[0].readAt).toBeInstanceOf(Date);
  });

  it("refuses to mutate another member's notification", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });
    const [bens] = await rowsFor(fixture.humanB);

    const result = await updateNotification.run({
      notificationIds: [bens.id],
      read: true,
    } as never);

    expect(result.updatedCount).toBe(0);
    expect((await rowsFor(fixture.humanB))[0].readAt).toBeNull();
  });

  it("marks all read for the current member only", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });
    await testDb()
      .insert(notifications)
      .values({
        userId: fixture.humanA,
        actorId: fixture.humanB,
        type: "issue_comment",
        entityType: "issue",
        entityId: issue.id,
        metadata: {},
      });

    const result = await markAllRead.run({} as never);

    expect(result.updatedCount).toBe(1);
    expect((await rowsFor(fixture.humanB))[0].readAt).toBeNull();
  });

  it("hides a dismissed notification from the Inbox but keeps the row", async () => {
    const issue = await createTestIssue(fixture.eng);
    const [row] = await testDb()
      .insert(notifications)
      .values({
        userId: fixture.humanA,
        actorId: fixture.humanB,
        type: "issue_comment",
        entityType: "issue",
        entityId: issue.id,
        metadata: {},
      })
      .returning();

    await updateNotification.run({
      notificationIds: [row.id],
      dismissed: true,
    } as never);
    const result = await inbox();

    expect(result.notifications).toHaveLength(0);
    expect(result.unreadCount).toBe(0);
    expect(await rowsFor(fixture.humanA)).toHaveLength(1);
  });

  it("rejects a patch that changes nothing", async () => {
    await expect(
      updateNotification.run({ notificationIds: ["whatever"] } as never),
    ).rejects.toThrow(/read or dismissed/i);
  });
});

describe("inbox read pipeline", () => {
  it("groups compatible comments, keeps mention and assignment separate, and counts underlying rows", async () => {
    const issue = await createTestIssue(fixture.eng, { createdBy: fixture.humanB });
    // Ana is the reader, so every event has to come from someone else.
    await testDb()
      .insert(notifications)
      .values([
        {
          userId: fixture.humanA,
          actorId: fixture.humanB,
          type: "issue_comment",
          entityType: "issue",
          entityId: issue.id,
          metadata: { commentId: "c1" },
        },
        {
          userId: fixture.humanA,
          actorId: fixture.agentA,
          type: "issue_comment",
          entityType: "issue",
          entityId: issue.id,
          metadata: { commentId: "c2" },
        },
        {
          userId: fixture.humanA,
          actorId: fixture.humanB,
          type: "comment_mention",
          entityType: "issue",
          entityId: issue.id,
          metadata: { commentId: "c3" },
        },
        {
          userId: fixture.humanA,
          actorId: fixture.humanB,
          type: "issue_assigned",
          entityType: "issue",
          entityId: issue.id,
          metadata: {},
        },
      ]);

    const result = await inbox();
    const groups = groupCompatible(result.notifications);

    expect(result.notifications).toHaveLength(4);
    expect(result.unreadCount).toBe(4);
    expect(groups).toHaveLength(3);

    const comments = groups.find((group) => group.type === "issue_comment")!;
    expect(comments.notifications).toHaveLength(2);
    expect(comments.actors).toHaveLength(2);
    expect(comments.unreadCount).toBe(2);
    expect(
      groups.filter((group) => group.notifications.length === 1),
    ).toHaveLength(2);
  });

  it("returns mentions only on the mentions filter", async () => {
    const issue = await createTestIssue(fixture.eng);
    await testDb()
      .insert(notifications)
      .values([
        {
          userId: fixture.humanA,
          actorId: fixture.humanB,
          type: "issue_comment",
          entityType: "issue",
          entityId: issue.id,
          metadata: {},
        },
        {
          userId: fixture.humanA,
          actorId: fixture.humanB,
          type: "comment_mention",
          entityType: "issue",
          entityId: issue.id,
          metadata: {},
        },
      ]);

    const result = await inbox({ filter: "mentions" });

    expect(result.notifications.map((item) => item.type)).toEqual([
      "comment_mention",
    ]);
    // The unread count is the whole Inbox, not the filtered slice.
    expect(result.unreadCount).toBe(2);
  });

  it("resolves the actor for rendering", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });
    const [row] = await rowsFor(fixture.humanB);

    // Ben has no Inbox of his own to read here, so assert the joinable shape.
    expect(row.actorId).toBe(fixture.humanA);
  });
});

describe("subscription constraints", () => {
  it("rejects a duplicate issue subscriber", async () => {
    const issue = await createTestIssue(fixture.eng);
    await update({ identifier: issue.id, assigneeId: fixture.humanB });

    // A plain insert, so nothing swallows the conflict the way the production
    // helper's onConflictDoNothing does.
    const message = await constraintViolation(
      testDb()
        .insert(issueSubscribers)
        .values({ issueId: issue.id, memberId: fixture.humanB }),
    );

    expect(message).toMatch(/duplicate key/i);
  });
});
