import { describe, expect, it } from "vitest";

import {
  applyTemplate,
  dueDateFromOffset,
  templateSummary,
  type TemplateDefaults,
} from "./issue-template";

const template: TemplateDefaults = {
  titleTemplate: "Bug: ",
  issueDescription: "## Steps\n1. ",
  priority: "medium",
  statusId: "status-todo",
  assigneeId: "member-a",
  projectId: "project-a",
  cycleId: "cycle-1",
  estimate: 3,
  labelIds: ["label-bug"],
};

const NOW = new Date("2026-03-15T12:00:00.000Z");

describe("applyTemplate", () => {
  it("fills every gap when the caller supplied nothing", () => {
    const result = applyTemplate({}, template, NOW);

    expect(result).toMatchObject({
      title: "Bug: ",
      priority: "medium",
      statusId: "status-todo",
      assigneeId: "member-a",
      projectId: "project-a",
      cycleId: "cycle-1",
      estimate: 3,
      labelIds: ["label-bug"],
    });
  });

  it("keeps an explicit value over the template's default", () => {
    const result = applyTemplate({ priority: "high" }, template, NOW);

    expect(result.priority).toBe("high");
  });

  it("treats an explicit null as a decision, not a gap", () => {
    const result = applyTemplate({ assigneeId: null }, template, NOW);

    expect(result.assigneeId).toBeNull();
  });

  it("treats an empty title as absent", () => {
    expect(applyTemplate({ title: "   " }, template, NOW).title).toBe("Bug: ");
  });

  it("keeps a typed title", () => {
    expect(applyTemplate({ title: "Real title" }, template, NOW).title).toBe(
      "Real title",
    );
  });

  it("keeps an explicitly empty label list", () => {
    expect(applyTemplate({ labelIds: [] }, template, NOW).labelIds).toEqual([]);
  });

  it("passes input straight through when there is no template", () => {
    expect(applyTemplate({ title: "Plain" }, null, NOW)).toEqual({
      title: "Plain",
    });
  });

  it("leaves fields the template does not set alone", () => {
    const result = applyTemplate({}, { priority: "low" }, NOW);

    expect(result.statusId).toBeUndefined();
    expect(result.labelIds).toBeUndefined();
  });

  it("applies the milestone when the project comes from the template", () => {
    const withMilestone = { ...template, milestoneId: "milestone-a" };

    expect(applyTemplate({}, withMilestone, NOW).milestoneId).toBe("milestone-a");
  });

  it("drops the milestone when the caller chose a different project", () => {
    const withMilestone = { ...template, milestoneId: "milestone-a" };

    const result = applyTemplate({ projectId: "project-b" }, withMilestone, NOW);

    expect(result.projectId).toBe("project-b");
    expect(result.milestoneId).toBeUndefined();
  });

  it("resolves a due-date offset against the creation date", () => {
    const result = applyTemplate({}, { dueDateOffsetDays: 7 }, NOW);

    expect(result.dueDate).toBe("2026-03-22");
  });

  it("keeps a due date the caller chose", () => {
    const result = applyTemplate(
      { dueDate: "2026-04-01" },
      { dueDateOffsetDays: 7 },
      NOW,
    );

    expect(result.dueDate).toBe("2026-04-01");
  });

  it("does not invent a due date when the template has no offset", () => {
    expect(applyTemplate({}, template, NOW).dueDate).toBeUndefined();
  });

  it("keeps an estimate of zero, which is a real value", () => {
    expect(applyTemplate({ estimate: 0 }, template, NOW).estimate).toBe(0);
  });
});

describe("dueDateFromOffset", () => {
  it("crosses a month boundary", () => {
    expect(dueDateFromOffset(20, NOW)).toBe("2026-04-04");
  });

  it("accepts a zero offset as due today", () => {
    expect(dueDateFromOffset(0, NOW)).toBe("2026-03-15");
  });
});

describe("templateSummary", () => {
  it("names the properties the template carries", () => {
    expect(templateSummary(template)).toEqual([
      "Title",
      "Description",
      "Status",
      "Priority",
      "Assignee",
      "Project",
      "Cycle",
      "Estimate",
      "1 label",
    ]);
  });

  it("is empty for a template with no defaults", () => {
    expect(templateSummary({})).toEqual([]);
  });

  it("counts labels and shows the due offset", () => {
    expect(
      templateSummary({ labelIds: ["a", "b"], dueDateOffsetDays: 3 }),
    ).toEqual(["Due +3d", "2 labels"]);
  });
});
