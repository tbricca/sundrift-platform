/**
 * A handful of invariants that the application also enforces in code. These
 * tests prove the database would still reject the write on its own, so a new
 * code path cannot quietly corrupt the data by skipping the helper.
 *
 * Not one test per index: only the uniqueness rules that carry meaning.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, expect, it } from "vitest";

import {
  issueLabels,
  issueRelations,
  issues,
  workflowStatuses,
} from "../../../drizzle/schema";
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

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  resetIssueCounter();
});

it("rejects a second issue with the same team and identifier number", async () => {
  const issue = await createTestIssue(fixture.eng);

  const message = await constraintViolation(
    testDb().insert(issues).values({
      teamId: fixture.eng.id,
      identifierNumber: issue.identifierNumber,
      title: "Clash",
      statusId: fixture.eng.status.todo,
      createdBy: fixture.humanA,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

  expect(message).toMatch(/duplicate key/i);
  expect(message).toMatch(/issues_team_number_idx/);
});

it("allows the same identifier number in a different team", async () => {
  const issue = await createTestIssue(fixture.eng);

  await expect(
    createTestIssue(fixture.prod, {
      identifierNumber: issue.identifierNumber,
    }),
  ).resolves.toMatchObject({ identifierNumber: issue.identifierNumber });
});

it("rejects a duplicate relation of the same type between the same issues", async () => {
  const one = await createTestIssue(fixture.eng);
  const two = await createTestIssue(fixture.eng);
  await testDb()
    .insert(issueRelations)
    .values({ issueId: one.id, relatedIssueId: two.id, type: "blocks" });

  const message = await constraintViolation(
    testDb()
      .insert(issueRelations)
      .values({ issueId: one.id, relatedIssueId: two.id, type: "blocks" }),
  );

  expect(message).toMatch(/duplicate key/i);
  expect(message).toMatch(/issue_relations_unique_idx/);
});

it("allows a second relation of a different type between the same issues", async () => {
  const one = await createTestIssue(fixture.eng);
  const two = await createTestIssue(fixture.eng);
  await testDb()
    .insert(issueRelations)
    .values({ issueId: one.id, relatedIssueId: two.id, type: "blocks" });

  await expect(
    testDb()
      .insert(issueRelations)
      .values({ issueId: one.id, relatedIssueId: two.id, type: "related" }),
  ).resolves.not.toThrow();
});

it("rejects the same label twice on one issue", async () => {
  const issue = await createTestIssue(fixture.eng);
  await testDb()
    .insert(issueLabels)
    .values({ issueId: issue.id, labelId: fixture.labelBug });

  const message = await constraintViolation(
    testDb()
      .insert(issueLabels)
      .values({ issueId: issue.id, labelId: fixture.labelBug }),
  );

  expect(message).toMatch(/duplicate key/i);
});

it("rejects an issue pointing at a status that does not exist", async () => {
  const message = await constraintViolation(
    testDb().insert(issues).values({
      teamId: fixture.eng.id,
      identifierNumber: 9001,
      title: "Dangling",
      statusId: "status-does-not-exist",
      createdBy: fixture.humanA,
      createdAt: NOW,
      updatedAt: NOW,
    }),
  );

  expect(message).toMatch(/foreign key|violates/i);
});

it("cascades issue deletion to its labels", async () => {
  const issue = await createTestIssue(fixture.eng);
  await testDb()
    .insert(issueLabels)
    .values({ issueId: issue.id, labelId: fixture.labelBug });

  await testDb().delete(issues).where(eq(issues.id, issue.id));

  expect(await testDb().select().from(issueLabels)).toHaveLength(0);
});

it("keeps the five seeded statuses per team", async () => {
  const rows = await testDb().select().from(workflowStatuses);

  expect(rows).toHaveLength(10);
});
