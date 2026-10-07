/**
 * Resource links point at an issue or a project through a polymorphic column,
 * so there is no foreign key doing the work: the write path is the only thing
 * standing between a link and a dangling or hostile target. That makes these
 * tests the actual constraint.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import createLink from "../../../actions/create-entity-link";
import deleteLink from "../../../actions/delete-entity-link";
import listLinks from "../../../actions/list-entity-links";
import updateLink from "../../../actions/update-entity-link";
import {
  entityLinks,
  issues,
  projects,
  workspaces,
} from "../../../drizzle/schema";
import {
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  createTestIssue,
  identifierOf,
  NOW,
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const add = (args: Record<string, unknown>) => createLink.run(args as never);
const list = (args: Record<string, unknown>) => listLinks.run(args as never);

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  await testDb().delete(entityLinks);
  resetIssueCounter();
});

describe("attaching links", () => {
  it("adds a link to an issue", async () => {
    const issue = await createTestIssue(fixture.eng);

    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://figma.com/file/abc",
      title: "Design spec",
    });

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      id: created.id,
      url: "https://figma.com/file/abc",
      title: "Design spec",
    });
  });

  it("adds a link to a project through the same action", async () => {
    const created = await add({
      entityType: "project",
      entityId: fixture.projectA,
      url: "https://docs.example.com/plan",
    });

    const { links } = await list({
      entityType: "project",
      entityId: fixture.projectA,
    });
    expect(links.map((link) => link.id)).toEqual([created.id]);
  });

  it("accepts an issue identifier as well as an id", async () => {
    const issue = await createTestIssue(fixture.eng);

    await add({
      entityType: "issue",
      entityId: identifierOf(fixture.eng, issue),
      url: "https://example.com/spec",
    });

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links).toHaveLength(1);
  });

  it("stores a null title when none is given", async () => {
    const issue = await createTestIssue(fixture.eng);

    await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
      title: "   ",
    });

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links[0].title).toBeNull();
  });

  it("normalises a URL that was pasted without a scheme", async () => {
    const issue = await createTestIssue(fixture.eng);

    await add({
      entityType: "issue",
      entityId: issue.id,
      url: "example.com/spec",
    });

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links[0].url).toBe("https://example.com/spec");
  });

  it("keeps links separate per entity", async () => {
    const one = await createTestIssue(fixture.eng);
    const two = await createTestIssue(fixture.eng);
    await add({
      entityType: "issue",
      entityId: one.id,
      url: "https://example.com/one",
    });
    await add({
      entityType: "issue",
      entityId: two.id,
      url: "https://example.com/two",
    });

    const { links } = await list({ entityType: "issue", entityId: one.id });
    expect(links.map((link) => link.url)).toEqual(["https://example.com/one"]);
  });

  it("returns links in insertion order", async () => {
    const issue = await createTestIssue(fixture.eng);
    for (const path of ["first", "second", "third"]) {
      await add({
        entityType: "issue",
        entityId: issue.id,
        url: `https://example.com/${path}`,
      });
    }

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links.map((link) => link.url)).toEqual([
      "https://example.com/first",
      "https://example.com/second",
      "https://example.com/third",
    ]);
  });
});

describe("rejected writes", () => {
  it("rejects a javascript URL", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      add({
        entityType: "issue",
        entityId: issue.id,
        url: "javascript:alert(document.cookie)",
      }),
    ).rejects.toThrow(/valid http or https/i);
  });

  it("rejects a data URL", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      add({
        entityType: "issue",
        entityId: issue.id,
        url: "data:text/html;base64,PHN2Zz4=",
      }),
    ).rejects.toThrow(/valid http or https/i);
  });

  it("rejects a file URL", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      add({
        entityType: "issue",
        entityId: issue.id,
        url: "file:///etc/passwd",
      }),
    ).rejects.toThrow(/valid http or https/i);
  });

  it("rejects text that is not a URL", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      add({ entityType: "issue", entityId: issue.id, url: "just some words" }),
    ).rejects.toThrow(/valid http or https/i);
  });

  it("rejects a target that does not exist", async () => {
    await expect(
      add({
        entityType: "project",
        entityId: "project-missing",
        url: "https://example.com",
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects a target in another workspace", async () => {
    const [other] = await testDb()
      .insert(workspaces)
      .values({ name: "Other", slug: "other" })
      .returning();
    const [foreign] = await testDb()
      .insert(projects)
      .values({
        workspaceId: other.id,
        name: "Foreign project",
        status: "planned",
      })
      .returning();

    await expect(
      add({
        entityType: "project",
        entityId: foreign.id,
        url: "https://example.com",
      }),
    ).rejects.toThrow(/different workspace/i);

    await testDb().delete(workspaces).where(eq(workspaces.id, other.id));
  });

  it("stores nothing when the URL is rejected", async () => {
    const issue = await createTestIssue(fixture.eng);

    await expect(
      add({ entityType: "issue", entityId: issue.id, url: "javascript:void" }),
    ).rejects.toThrow();

    expect(await testDb().select().from(entityLinks)).toHaveLength(0);
  });
});

describe("editing and removing", () => {
  it("renames a link", async () => {
    const issue = await createTestIssue(fixture.eng);
    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
    });

    await updateLink.run({ id: created.id, title: "Spec" } as never);

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links[0].title).toBe("Spec");
  });

  it("clears a title back to the derived fallback", async () => {
    const issue = await createTestIssue(fixture.eng);
    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
      title: "Spec",
    });

    await updateLink.run({ id: created.id, title: null } as never);

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links[0].title).toBeNull();
  });

  it("validates a replacement URL the same way", async () => {
    const issue = await createTestIssue(fixture.eng);
    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
    });

    await expect(
      updateLink.run({ id: created.id, url: "javascript:alert(1)" } as never),
    ).rejects.toThrow(/valid http or https/i);

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links[0].url).toBe("https://example.com/a");
  });

  it("rejects an update that changes nothing", async () => {
    const issue = await createTestIssue(fixture.eng);
    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
    });

    await expect(updateLink.run({ id: created.id } as never)).rejects.toThrow(
      /url, title or sortOrder/i,
    );
  });

  it("reorders through sortOrder", async () => {
    const issue = await createTestIssue(fixture.eng);
    const first = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/first",
    });
    await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/second",
    });

    await updateLink.run({ id: first.id, sortOrder: 5000 } as never);

    const { links } = await list({ entityType: "issue", entityId: issue.id });
    expect(links.map((link) => link.url)).toEqual([
      "https://example.com/second",
      "https://example.com/first",
    ]);
  });

  it("deletes a link", async () => {
    const issue = await createTestIssue(fixture.eng);
    const created = await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/a",
    });

    await deleteLink.run({ id: created.id } as never);

    expect(
      (await list({ entityType: "issue", entityId: issue.id })).links,
    ).toHaveLength(0);
  });

  it("reports a link that does not exist", async () => {
    await expect(deleteLink.run({ id: "nope" } as never)).rejects.toThrow(
      /link not found/i,
    );
  });
});

describe("target lifecycle", () => {
  it("keeps a soft-deleted issue's links, which return with the issue", async () => {
    const issue = await createTestIssue(fixture.eng);
    await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/spec",
    });

    await testDb()
      .update(issues)
      .set({ deletedAt: NOW })
      .where(eq(issues.id, issue.id));

    // The rows survive; they are simply unreachable while the only route to
    // them is the deleted issue's own detail view.
    expect(await testDb().select().from(entityLinks)).toHaveLength(1);
    await expect(
      list({ entityType: "issue", entityId: issue.id }),
    ).rejects.toThrow(/issue not found/i);
  });

  it("leaves an orphan row unreadable when the issue is hard deleted", async () => {
    const issue = await createTestIssue(fixture.eng);
    await add({
      entityType: "issue",
      entityId: issue.id,
      url: "https://example.com/spec",
    });

    await testDb().delete(issues).where(eq(issues.id, issue.id));

    // No foreign key covers a polymorphic column, so the row outlives its
    // target by design; the reader is what refuses to resolve it.
    const orphans = await testDb().select().from(entityLinks);
    expect(orphans).toHaveLength(1);
    await expect(
      list({ entityType: "issue", entityId: issue.id }),
    ).rejects.toThrow(/issue not found/i);
  });
});
