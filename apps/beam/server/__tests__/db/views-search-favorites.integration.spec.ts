/**
 * Three small read/write paths that all persist something and read it back:
 * a saved view is a stored `IssueQuery`, search is SQL over real text, and a
 * favorite is a per-member row with manual ordering. Ranking weights and URL
 * serialisation are covered by pure tests; these check the database behaviour.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import createComment from "../../../actions/create-comment";
import createSavedView from "../../../actions/create-saved-view";
import getWorkspace from "../../../actions/get-workspace";
import listSavedViews from "../../../actions/list-saved-views";
import searchWorkspaceAction from "../../../actions/search-workspace";
import updateFavorite from "../../../actions/update-favorite";
import updateSavedView from "../../../actions/update-saved-view";
import { issueQuery } from "../../../app/lib/issue-query";
import { favorites, savedViews } from "../../../drizzle/schema";
import {
  constraintViolation,
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  createTestIssue,
  NOW,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const search = (query: string) =>
  searchWorkspaceAction.run({ query } as never);

const favorite = (args: Record<string, unknown>) =>
  updateFavorite.run(args as never);

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

describe("saved view persistence", () => {
  const descriptor = () =>
    issueQuery({
      filters: {
        teamId: ["team-eng"],
        statusCategory: ["started", "unstarted"],
        assigneeId: [null],
        includeArchived: true,
        exclude: { priority: ["none"] },
      },
      grouping: "assignee",
      ordering: [
        { field: "priority", direction: "desc" },
        { field: "title", direction: "asc" },
      ],
      layout: "board",
      visibleColumns: ["priority", "assignee", "dueDate"],
    });

  it("round-trips the whole IssueQuery descriptor", async () => {
    const created = await createSavedView.run({
      name: "Active, unassigned",
      query: descriptor(),
      teamId: fixture.eng.id,
    } as never);

    const { views } = await listSavedViews.run({} as never);
    const view = views.find((entry) => entry.id === created.id)!;

    expect(view.query).toEqual(descriptor());
    expect(view.teamId).toBe(fixture.eng.id);
    expect(view.isShared).toBe(false);
    expect(view.isOwn).toBe(true);
  });

  it("stores the descriptor across the view's own columns, not as one blob", async () => {
    const created = await createSavedView.run({
      name: "Columns",
      query: descriptor(),
    } as never);

    const [row] = await testDb()
      .select()
      .from(savedViews)
      .where(eq(savedViews.id, created.id));

    expect(row.grouping).toBe("assignee");
    expect(row.layout).toBe("board");
    expect(row.visibleColumns).toEqual(["priority", "assignee", "dueDate"]);
    expect((row.filters as Record<string, unknown>).includeArchived).toBe(true);
  });

  it("keeps the descriptor canonical after an edit", async () => {
    const created = await createSavedView.run({
      name: "Editable",
      query: descriptor(),
    } as never);

    await updateSavedView.run({
      id: created.id,
      query: issueQuery({
        filters: { priority: ["urgent"] },
        grouping: "none",
        layout: "list",
      }),
    } as never);

    const { views } = await listSavedViews.run({} as never);
    const view = views.find((entry) => entry.id === created.id)!;

    expect(view.query).toEqual(
      issueQuery({
        filters: { priority: ["urgent"] },
        grouping: "none",
        layout: "list",
      }),
    );
  });

  it("returns a workspace-wide view under a team filter only when scoped to it", async () => {
    await createSavedView.run({
      name: "Eng only",
      query: issueQuery(),
      teamId: fixture.eng.id,
    } as never);
    await createSavedView.run({
      name: "Everywhere",
      query: issueQuery(),
    } as never);

    const scoped = await listSavedViews.run({ teamId: fixture.eng.id } as never);

    expect(scoped.views.map((view) => view.name)).toEqual(["Eng only"]);
  });

  it("rejects a descriptor the schema does not recognise", async () => {
    await expect(
      createSavedView.run({
        name: "Bad",
        query: { ...issueQuery(), grouping: "nonsense" },
      } as never),
    ).rejects.toThrow();
  });
});

describe("search", () => {
  it("puts an exact identifier match first", async () => {
    await createTestIssue(fixture.eng, { title: "Unrelated work" });
    const target = await createTestIssue(fixture.eng, { title: "Second one" });

    const results = await search(`ENG-${target.identifierNumber}`);

    expect(results.issues[0].id).toBe(target.id);
  });

  it("matches a word inside a title", async () => {
    const match = await createTestIssue(fixture.eng, {
      title: "Checkout latency spike",
    });
    await createTestIssue(fixture.eng, { title: "Onboarding copy" });

    const results = await search("latency");

    expect(results.issues.map((issue) => issue.id)).toEqual([match.id]);
  });

  it("matches text in the description", async () => {
    const match = await createTestIssue(fixture.eng, {
      title: "Nothing obvious",
      description: "The webhook retries forever",
    });

    const results = await search("webhook");

    expect(results.issues.map((issue) => issue.id)).toContain(match.id);
  });

  it("resolves a comment hit to its issue", async () => {
    const issue = await createTestIssue(fixture.eng, { title: "Quiet title" });
    await createComment.run({
      identifier: issue.id,
      body: "The regression started after the pagination change",
    } as never);

    const results = await search("pagination");

    expect(results.issues.map((entry) => entry.id)).toContain(issue.id);
  });

  it("excludes soft-deleted issues", async () => {
    await createTestIssue(fixture.eng, {
      title: "Deleted latency note",
      deletedAt: NOW,
    });

    const results = await search("latency");

    expect(results.issues).toHaveLength(0);
  });

  it("includes triage, archived and completed issues, flagged for the caller", async () => {
    const triaged = await createTestIssue(fixture.eng, {
      title: "Triage latency report",
      triageStatus: "pending",
      triageSource: "agent",
    });
    const archived = await createTestIssue(fixture.eng, {
      title: "Archived latency fix",
      archivedAt: NOW,
    });
    const completed = await createTestIssue(fixture.eng, {
      title: "Completed latency fix",
      statusId: fixture.eng.status.done,
      completedAt: NOW,
    });

    const ids = (await search("latency")).issues.map((issue) => issue.id);

    expect(ids).toContain(triaged.id);
    expect(ids).toContain(archived.id);
    expect(ids).toContain(completed.id);
    const archivedResult = (await search("latency")).issues.find(
      (issue) => issue.id === archived.id,
    )!;
    expect(archivedResult.archived).toBe(true);
  });

  it("finds projects, cycles, views and members too", async () => {
    await createSavedView.run({
      name: "Latency watch",
      query: issueQuery(),
    } as never);

    const projects = await search("Project A");
    const members = await search("Ben");
    const views = await search("Latency watch");

    expect(projects.projects.map((project) => project.id)).toContain(
      fixture.projectA,
    );
    expect(members.members.map((member) => member.id)).toContain(fixture.humanB);
    expect(views.views.map((view) => view.name)).toContain("Latency watch");
  });
});

describe("favorites", () => {
  const listFavorites = async () =>
    (await getWorkspace.run({} as never))!.favorites;

  it("favorites each kind of entity", async () => {
    const issue = await createTestIssue(fixture.eng);
    const view = await createSavedView.run({
      name: "Starred",
      query: issueQuery(),
    } as never);

    await favorite({ entityType: "issue", entityId: issue.id, favorite: true });
    await favorite({
      entityType: "project",
      entityId: fixture.projectA,
      favorite: true,
    });
    await favorite({ entityType: "view", entityId: view.id, favorite: true });
    await favorite({
      entityType: "cycle",
      entityId: fixture.eng.currentCycleId,
      favorite: true,
    });

    const types = (await listFavorites()).map((entry) => entry.entityType);
    expect(types.sort()).toEqual(["cycle", "issue", "project", "view"]);
  });

  it("is idempotent: favoriting twice keeps one row", async () => {
    const issue = await createTestIssue(fixture.eng);

    const first = await favorite({
      entityType: "issue",
      entityId: issue.id,
      favorite: true,
    });
    const second = await favorite({
      entityType: "issue",
      entityId: issue.id,
      favorite: true,
    });

    expect(second.id).toBe(first.id);
    expect(await listFavorites()).toHaveLength(1);
  });

  it("rejects a duplicate row at the database level", async () => {
    const issue = await createTestIssue(fixture.eng);
    await favorite({ entityType: "issue", entityId: issue.id, favorite: true });

    const message = await constraintViolation(
      testDb()
        .insert(favorites)
        .values({
          userId: fixture.humanA,
          entityType: "issue",
          entityId: issue.id,
          sortOrder: 1,
        }),
    );

    expect(message).toMatch(/duplicate key/i);
  });

  it("appends new favorites after existing ones", async () => {
    const first = await createTestIssue(fixture.eng);
    const second = await createTestIssue(fixture.eng);

    await favorite({ entityType: "issue", entityId: first.id, favorite: true });
    await favorite({ entityType: "issue", entityId: second.id, favorite: true });

    expect((await listFavorites()).map((entry) => entry.entityId)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it("unfavoriting removes the row", async () => {
    const issue = await createTestIssue(fixture.eng);
    await favorite({ entityType: "issue", entityId: issue.id, favorite: true });

    const result = await favorite({
      entityType: "issue",
      entityId: issue.id,
      favorite: false,
    });

    expect(result.favorite).toBe(false);
    expect(await listFavorites()).toHaveLength(0);
  });

  it("unfavoriting something that was never favorited is a no-op", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      favorite({ entityType: "issue", entityId: issue.id, favorite: false }),
    ).resolves.toEqual({ favorite: false });
  });

  it("keeps the reader working when the favorited entity is gone", async () => {
    await favorite({
      entityType: "issue",
      entityId: "00000000-0000-0000-0000-000000000000",
      favorite: true,
    });

    const rows = await listFavorites();

    expect(rows).toHaveLength(1);
    expect(rows[0].entityType).toBe("issue");
  });

  it("keeps favorites per member", async () => {
    const issue = await createTestIssue(fixture.eng);
    await testDb()
      .insert(favorites)
      .values({
        userId: fixture.humanB,
        entityType: "issue",
        entityId: issue.id,
        sortOrder: 0,
      });

    // The acting member is Ana, so Ben's row must not appear.
    expect(await listFavorites()).toHaveLength(0);
  });
});
