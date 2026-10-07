/**
 * Templates carry real references, so the interesting cases are the ones where
 * a template disagrees with the team it belongs to, and the ones where it has
 * gone stale. Applying a template must never be a way around the validation
 * that `create-issue` performs on a hand-written call.
 */
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import createIssue from "../../../actions/create-issue";
import createTemplate from "../../../actions/create-issue-template";
import deleteTemplate from "../../../actions/delete-issue-template";
import listTemplates from "../../../actions/list-issue-templates";
import updateTemplate from "../../../actions/update-issue-template";
import {
  activities,
  issueLabels,
  issueTemplateLabels,
  issueTemplates,
  issues,
  workflowStatuses,
} from "../../../drizzle/schema";
import {
  resetIssueData,
  resetTestDatabase,
  testDb,
} from "../../testing/database";
import {
  resetIssueCounter,
  seedTestWorkspace,
  type Fixture,
} from "../../testing/fixtures";

let fixture: Fixture;

const create = (args: Record<string, unknown>) =>
  createTemplate.run(args as never);
const update = (args: Record<string, unknown>) =>
  updateTemplate.run(args as never);
const list = (args: Record<string, unknown> = {}) =>
  listTemplates.run(args as never);
const newIssue = (args: Record<string, unknown>) =>
  createIssue.run(args as never);

const readIssue = async (id: string) =>
  (await testDb().select().from(issues).where(eq(issues.id, id)))[0];

const issueByIdentifier = async (identifier: string) => {
  const number = Number(identifier.split("-")[1]);
  const [row] = await testDb()
    .select()
    .from(issues)
    .where(eq(issues.identifierNumber, number));
  return row;
};

const labelsOf = async (issueId: string) =>
  (await testDb().select().from(issueLabels).where(eq(issueLabels.issueId, issueId)))
    .map((row) => row.labelId)
    .sort();

beforeAll(async () => {
  await resetTestDatabase();
  fixture = await seedTestWorkspace();
});

beforeEach(async () => {
  await resetIssueData();
  await testDb().delete(issueTemplates);
  resetIssueCounter();
});

describe("template writes", () => {
  it("creates a template with defaults and labels", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      name: "Bug report",
      description: "For customer-reported defects",
      titleTemplate: "Bug: ",
      issueDescription: "## Steps",
      priority: "high",
      statusId: fixture.eng.status.todo,
      assigneeId: fixture.humanB,
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
      cycleId: fixture.eng.currentCycleId,
      estimate: 2,
      dueDateOffsetDays: 7,
      labelIds: [fixture.labelBug],
    });

    const { templates } = await list({ teamId: fixture.eng.id });
    const template = templates.find((entry) => entry.id === created.id)!;

    expect(template.name).toBe("Bug report");
    expect(template.priority).toBe("high");
    expect(template.statusId).toBe(fixture.eng.status.todo);
    expect(template.milestoneId).toBe(fixture.milestoneA);
    expect(template.dueDateOffsetDays).toBe(7);
    expect(template.labelIds).toEqual([fixture.labelBug]);
    expect(template.summary).toContain("Priority");
  });

  it("belongs to one team and is not listed for another", async () => {
    await create({ teamId: fixture.eng.id, name: "Eng only" });

    const prod = await list({ teamId: fixture.prod.id });

    expect(prod.templates).toHaveLength(0);
  });

  it("rejects a status owned by another team", async () => {
    await expect(
      create({
        teamId: fixture.eng.id,
        name: "Wrong status",
        statusId: fixture.prod.status.doing,
      }),
    ).rejects.toThrow(/different team/i);
  });

  it("rejects a cycle owned by another team", async () => {
    await expect(
      create({
        teamId: fixture.eng.id,
        name: "Wrong cycle",
        cycleId: fixture.prod.currentCycleId,
      }),
    ).rejects.toThrow(/different team/i);
  });

  it("rejects a milestone from a different project", async () => {
    await expect(
      create({
        teamId: fixture.eng.id,
        name: "Wrong milestone",
        projectId: fixture.projectA,
        milestoneId: fixture.milestoneB,
      }),
    ).rejects.toThrow(/different project/i);
  });

  it("rejects a label that does not exist", async () => {
    await expect(
      create({
        teamId: fixture.eng.id,
        name: "Ghost label",
        labelIds: ["label-missing"],
      }),
    ).rejects.toThrow(/no longer exists/i);
  });

  it("rejects an unknown team", async () => {
    await expect(
      create({ teamId: "team-missing", name: "Nowhere" }),
    ).rejects.toThrow(/team not found/i);
  });

  it("replaces labels wholesale on update", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      name: "Labels",
      labelIds: [fixture.labelBug],
    });

    await update({ id: created.id, labelIds: [fixture.labelFeature] });

    const rows = await testDb()
      .select()
      .from(issueTemplateLabels)
      .where(eq(issueTemplateLabels.templateId, created.id));
    expect(rows.map((row) => row.labelId)).toEqual([fixture.labelFeature]);
  });

  it("clears the milestone when the project changes", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      name: "Moving",
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
    });

    await update({ id: created.id, projectId: fixture.projectB });

    const { templates } = await list({ teamId: fixture.eng.id });
    const template = templates.find((entry) => entry.id === created.id)!;
    expect(template.projectId).toBe(fixture.projectB);
    expect(template.milestoneId).toBeNull();
  });

  it("still rejects a cross-team status on update", async () => {
    const created = await create({ teamId: fixture.eng.id, name: "Fine" });

    await expect(
      update({ id: created.id, statusId: fixture.prod.status.done }),
    ).rejects.toThrow(/different team/i);
  });

  it("reports a missing template", async () => {
    await expect(update({ id: "nope", name: "x" })).rejects.toThrow(
      /template not found/i,
    );
  });
});

describe("archiving", () => {
  it("hides an archived template from the normal list", async () => {
    const created = await create({ teamId: fixture.eng.id, name: "Retired" });

    await update({ id: created.id, archived: true });

    expect((await list({ teamId: fixture.eng.id })).templates).toHaveLength(0);
    const all = await list({ teamId: fixture.eng.id, includeArchived: true });
    expect(all.templates).toHaveLength(1);
    expect(all.templates[0].archivedAt).not.toBeNull();
  });

  it("brings an archived template back", async () => {
    const created = await create({ teamId: fixture.eng.id, name: "Returning" });
    await update({ id: created.id, archived: true });

    await update({ id: created.id, archived: false });

    expect((await list({ teamId: fixture.eng.id })).templates).toHaveLength(1);
  });

  it("deletes a template and its labels outright", async () => {
    const created = await create({
      teamId: fixture.eng.id,
      name: "Gone",
      labelIds: [fixture.labelBug],
    });

    await deleteTemplate.run({ id: created.id } as never);

    expect((await testDb().select().from(issueTemplates))).toHaveLength(0);
    expect(await testDb().select().from(issueTemplateLabels)).toHaveLength(0);
  });

  it("still applies for a caller holding the id, since archiving only hides it", async () => {
    // Archiving hides a template from selectors; an id someone already holds
    // keeps working, which is the same rule Beam applies to soft-deleted rows
    // being readable by direct reference.
    const created = await create({
      teamId: fixture.eng.id,
      name: "Archived but referenced",
      priority: "urgent",
    });
    await update({ id: created.id, archived: true });

    const issue = await newIssue({
      teamId: fixture.eng.id,
      title: "From an archived template",
      templateId: created.id,
    });

    expect((await issueByIdentifier(issue.identifier)).priority).toBe("urgent");
  });
});

describe("duplication", () => {
  it("copies defaults and labels under a new name and id", async () => {
    const original = await create({
      teamId: fixture.eng.id,
      name: "Bug report",
      description: "Original",
      issueDescription: "## Steps",
      priority: "high",
      labelIds: [fixture.labelBug, fixture.labelFeature],
    });
    const { templates } = await list({ teamId: fixture.eng.id });
    const source = templates.find((entry) => entry.id === original.id)!;

    // Duplication is a create with the same values; there is no second write
    // path for it.
    const copy = await create({
      teamId: source.teamId,
      name: `Copy of ${source.name}`,
      description: source.description,
      issueDescription: source.issueDescription,
      priority: source.priority,
      labelIds: source.labelIds,
    });

    const after = (await list({ teamId: fixture.eng.id })).templates;
    const duplicate = after.find((entry) => entry.id === copy.id)!;

    expect(duplicate.id).not.toBe(source.id);
    expect(duplicate.name).toBe("Copy of Bug report");
    expect(duplicate.priority).toBe("high");
    expect(duplicate.labelIds.sort()).toEqual(
      [fixture.labelBug, fixture.labelFeature].sort(),
    );
    expect(after).toHaveLength(2);
  });
});

describe("creating an issue from a template", () => {
  const fullTemplate = () =>
    create({
      teamId: fixture.eng.id,
      name: "Full",
      titleTemplate: "Bug: ",
      issueDescription: "## Steps",
      priority: "high",
      statusId: fixture.eng.status.doing,
      assigneeId: fixture.humanB,
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
      cycleId: fixture.eng.currentCycleId,
      estimate: 5,
      labelIds: [fixture.labelBug],
    });

  it("applies every default", async () => {
    const template = await fullTemplate();

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Checkout crash",
      templateId: template.id,
    });
    const issue = await issueByIdentifier(created.identifier);

    expect(issue.title).toBe("Checkout crash");
    expect(issue.description).toBe("## Steps");
    expect(issue.priority).toBe("high");
    expect(issue.statusId).toBe(fixture.eng.status.doing);
    expect(issue.assigneeId).toBe(fixture.humanB);
    expect(issue.projectId).toBe(fixture.projectA);
    expect(issue.milestoneId).toBe(fixture.milestoneA);
    expect(issue.cycleId).toBe(fixture.eng.currentCycleId);
    expect(issue.estimate).toBe(5);
    expect(await labelsOf(issue.id)).toEqual([fixture.labelBug]);
  });

  it("lets explicit input win over every template default", async () => {
    const template = await fullTemplate();

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Explicit",
      templateId: template.id,
      priority: "low",
      statusId: fixture.eng.status.backlog,
      assigneeId: fixture.humanA,
      estimate: 1,
      labelIds: [fixture.labelFeature],
    });
    const issue = await issueByIdentifier(created.identifier);

    expect(issue.priority).toBe("low");
    expect(issue.statusId).toBe(fixture.eng.status.backlog);
    expect(issue.assigneeId).toBe(fixture.humanA);
    expect(issue.estimate).toBe(1);
    expect(await labelsOf(issue.id)).toEqual([fixture.labelFeature]);
  });

  it("takes the team from the template when the caller names none", async () => {
    const template = await create({ teamId: fixture.prod.id, name: "Prod" });

    const created = await newIssue({
      title: "Team from template",
      templateId: template.id,
    });

    expect(created.identifier.startsWith("PROD-")).toBe(true);
  });

  it("rejects a template belonging to another team", async () => {
    const template = await create({ teamId: fixture.prod.id, name: "Prod" });

    await expect(
      newIssue({
        teamId: fixture.eng.id,
        title: "Mismatch",
        templateId: template.id,
      }),
    ).rejects.toThrow(/different team/i);
  });

  it("reports a template that does not exist", async () => {
    await expect(
      newIssue({ teamId: fixture.eng.id, title: "x", templateId: "nope" }),
    ).rejects.toThrow(/template not found/i);
  });

  it("resolves a due-date offset to a concrete date", async () => {
    const template = await create({
      teamId: fixture.eng.id,
      name: "Due soon",
      dueDateOffsetDays: 7,
    });

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Due",
      templateId: template.id,
    });
    const issue = await issueByIdentifier(created.identifier);

    const expected = new Date();
    expected.setUTCDate(expected.getUTCDate() + 7);
    expect(issue.dueDate?.toISOString().slice(0, 10)).toBe(
      expected.toISOString().slice(0, 10),
    );
  });

  it("uses the template title when the caller has not typed one", async () => {
    const template = await create({
      teamId: fixture.eng.id,
      name: "Titled",
      titleTemplate: "Weekly report",
    });

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Weekly report",
      templateId: template.id,
    });

    expect((await issueByIdentifier(created.identifier)).title).toBe(
      "Weekly report",
    );
  });

  it("drops a status that has been deleted since the template was saved", async () => {
    const [status] = await testDb()
      .insert(workflowStatuses)
      .values({
        teamId: fixture.eng.id,
        name: "Temporary",
        color: "#888888",
        category: "started",
        position: 9,
      })
      .returning();
    const template = await create({
      teamId: fixture.eng.id,
      name: "Stale",
      statusId: status.id,
      priority: "urgent",
    });
    await testDb()
      .delete(workflowStatuses)
      .where(eq(workflowStatuses.id, status.id));

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Still works",
      templateId: template.id,
    });
    const issue = await issueByIdentifier(created.identifier);

    // The stale reference is dropped, the rest of the template still applies,
    // and the issue falls back to the team's normal default status.
    expect(issue.statusId).toBe(fixture.eng.status.todo);
    expect(issue.priority).toBe("urgent");
  });

  it("drops a milestone whose project no longer matches", async () => {
    const template = await create({
      teamId: fixture.eng.id,
      name: "Milestone drift",
      projectId: fixture.projectA,
      milestoneId: fixture.milestoneA,
    });

    // The caller moves the issue to another project; the template's milestone
    // cannot come along, and must not slip past create-issue's own check.
    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Moved",
      templateId: template.id,
      projectId: fixture.projectB,
    });
    const issue = await issueByIdentifier(created.identifier);

    expect(issue.projectId).toBe(fixture.projectB);
    expect(issue.milestoneId).toBeNull();
  });

  it("records the template on the creation activity", async () => {
    const template = await create({ teamId: fixture.eng.id, name: "Tracked" });

    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Provenance",
      templateId: template.id,
    });
    const issue = await issueByIdentifier(created.identifier);

    const [entry] = await testDb()
      .select()
      .from(activities)
      .where(eq(activities.issueId, issue.id));
    expect(entry.type).toBe("created");
    expect((entry.metadata as Record<string, string>).templateName).toBe(
      "Tracked",
    );
  });

  it("leaves ordinary creation untouched when no template is named", async () => {
    const created = await newIssue({
      teamId: fixture.eng.id,
      title: "Plain issue",
    });
    const issue = await readIssue(
      (await issueByIdentifier(created.identifier)).id,
    );

    expect(issue.priority).toBe("none");
    expect(issue.statusId).toBe(fixture.eng.status.todo);
    expect(issue.description).toBeNull();
  });
});
