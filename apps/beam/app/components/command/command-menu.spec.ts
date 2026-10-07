import { describe, expect, it } from "vitest";

import type { CommandContext } from "./commands";
import {
  cycleMenuModel,
  issueMenuModel,
  linkMenuModel,
  menuCommands,
  projectMenuModel,
  propertyBlockedReason,
  savedViewMenuModel,
  type MenuScope,
} from "./command-menu";

const baseCtx: CommandContext = {
  count: 1,
  hasIssue: true,
  hasTeam: true,
  hasProject: false,
  hasCycle: false,
  inInbox: false,
  hasTriage: false,
  anyArchived: false,
  allArchived: false,
};

const oneTeam: MenuScope = {
  singleTeam: true,
  sameProject: true,
  projectId: "project-a",
};

const ids = (sections: ReturnType<typeof issueMenuModel>) =>
  sections.flatMap((section) => section.items.map((item) => item.id));

const propertyItem = (
  sections: ReturnType<typeof issueMenuModel>,
  id: string,
) =>
  sections
    .flatMap((section) => section.items)
    .find((item) => item.kind === "property" && item.id === id) as
    | { disabled: boolean; reason?: string }
    | undefined;

describe("one issue", () => {
  it("offers the everyday properties", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam });

    expect(ids(model)).toEqual(
      expect.arrayContaining([
        "status",
        "priority",
        "assignee",
        "labels",
        "project",
        "cycle",
      ]),
    );
  });

  it("offers both copy commands", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam });

    expect(ids(model)).toEqual(
      expect.arrayContaining(["copy-identifier", "copy-issue-link"]),
    );
  });

  it("offers Open only when the surface is a row", () => {
    expect(ids(issueMenuModel({ ctx: baseCtx, scope: oneTeam }))).not.toContain(
      "open",
    );
    expect(
      ids(issueMenuModel({ ctx: baseCtx, scope: oneTeam, canOpen: true })),
    ).toContain("open");
  });

  it("offers Subscribe or Unsubscribe from the current state", () => {
    const subscribed = issueMenuModel({
      ctx: baseCtx,
      scope: oneTeam,
      subscribed: true,
    });
    const not = issueMenuModel({
      ctx: baseCtx,
      scope: oneTeam,
      subscribed: false,
    });

    expect(ids(subscribed)).toContain("unsubscribe");
    expect(ids(subscribed)).not.toContain("subscribe");
    expect(ids(not)).toContain("subscribe");
  });

  it("omits subscription when the surface did not supply the state", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam });

    expect(ids(model)).not.toContain("subscribe");
    expect(ids(model)).not.toContain("unsubscribe");
  });
});

describe("archived issues", () => {
  it("offers Archive for a live issue", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam });

    expect(ids(model)).toContain("archive");
    expect(ids(model)).not.toContain("unarchive");
  });

  it("offers Unarchive instead once every target is archived", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, anyArchived: true, allArchived: true },
      scope: oneTeam,
    });

    expect(ids(model)).toContain("unarchive");
    expect(ids(model)).not.toContain("archive");
  });

  it("offers both for a mixed selection, since each applies to part of it", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, count: 3, anyArchived: true, allArchived: false },
      scope: oneTeam,
    });

    expect(ids(model)).toEqual(expect.arrayContaining(["archive", "unarchive"]));
  });
});

describe("multi-selection", () => {
  const multi = { ...baseCtx, count: 4 };

  it("drops the copy commands, which only mean something for one issue", () => {
    const model = issueMenuModel({ ctx: multi, scope: oneTeam });

    expect(ids(model)).not.toContain("copy-identifier");
    expect(ids(model)).not.toContain("copy-issue-link");
  });

  it("drops Open and subscription", () => {
    const model = issueMenuModel({
      ctx: multi,
      scope: oneTeam,
      subscribed: false,
      canOpen: true,
    });

    expect(ids(model)).not.toContain("open");
    expect(ids(model)).not.toContain("subscribe");
  });

  it("keeps the bulk-compatible property and lifecycle commands", () => {
    const model = issueMenuModel({ ctx: multi, scope: oneTeam });

    expect(ids(model)).toEqual(
      expect.arrayContaining([
        "status",
        "assignee",
        "cycle-current",
        "cycle-next",
        "delete",
      ]),
    );
  });
});

describe("cross-team and cross-project selections", () => {
  const spanning: MenuScope = {
    singleTeam: false,
    sameProject: false,
    projectId: null,
  };

  it("disables status and cycle, explaining why", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, count: 3 },
      scope: spanning,
    });

    expect(propertyItem(model, "status")?.disabled).toBe(true);
    expect(propertyItem(model, "status")?.reason).toMatch(/teams/i);
    expect(propertyItem(model, "cycle")?.disabled).toBe(true);
  });

  it("keeps current and next cycle, which resolve per team", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, count: 3 },
      scope: spanning,
    });

    expect(ids(model)).toEqual(
      expect.arrayContaining(["cycle-current", "cycle-next"]),
    );
  });

  it("keeps assignee and priority, which are team-independent", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, count: 3 },
      scope: spanning,
    });

    expect(propertyItem(model, "assignee")?.disabled).toBe(false);
    expect(propertyItem(model, "priority")?.disabled).toBe(false);
  });

  it("disables milestone across projects", () => {
    expect(propertyBlockedReason("milestone", spanning)).toMatch(/projects/i);
  });

  it("disables milestone when the shared project is none", () => {
    expect(
      propertyBlockedReason("milestone", {
        singleTeam: true,
        sameProject: true,
        projectId: null,
      }),
    ).toMatch(/need a project/i);
  });

  it("allows milestone within one project", () => {
    expect(propertyBlockedReason("milestone", oneTeam)).toBeUndefined();
  });
});

describe("triage context", () => {
  it("puts the review decisions first", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam, triage: true });

    expect(model[0].items.map((entry) => entry.id)).toEqual([
      "accept",
      "decline",
      "snooze",
    ]);
  });

  it("still offers the ordinary issue commands underneath", () => {
    const model = issueMenuModel({ ctx: baseCtx, scope: oneTeam, triage: true });

    expect(ids(model)).toEqual(
      expect.arrayContaining(["assignee", "priority", "copy-issue-link"]),
    );
  });

  it("keeps the decisions for a multi-selection", () => {
    const model = issueMenuModel({
      ctx: { ...baseCtx, count: 5 },
      scope: oneTeam,
      triage: true,
    });

    expect(ids(model)).toEqual(
      expect.arrayContaining(["accept", "decline", "snooze"]),
    );
  });

  it("omits them outside triage", () => {
    expect(ids(issueMenuModel({ ctx: baseCtx, scope: oneTeam }))).not.toContain(
      "accept",
    );
  });
});

describe("registry reuse", () => {
  it("takes labels from the command registry rather than restating them", () => {
    const [entry] = menuCommands(["cycle-current"], baseCtx);

    expect(entry.label).toBe("Move to current cycle");
  });

  it("drops commands the registry says are unavailable here", () => {
    expect(
      menuCommands(["copy-identifier"], { ...baseCtx, count: 4 }),
    ).toEqual([]);
  });

  it("ignores ids that are not in the registry", () => {
    expect(menuCommands(["not-a-command" as never], baseCtx)).toEqual([]);
  });
});

describe("other entities", () => {
  it("gives a project its editors, favorites and link, but no delete", () => {
    const model = projectMenuModel(false);
    const entries = model.flatMap((section) => section.items.map((i) => i.id));

    expect(entries).toEqual(
      expect.arrayContaining([
        "open",
        "project-status",
        "project-priority",
        "project-health",
        "project-lead",
        "favorite",
        "copy-project-link",
      ]),
    );
    expect(entries).not.toContain("delete");
  });

  it("flips the favorite entry to removal when already favorited", () => {
    const entries = projectMenuModel(true).flatMap((section) =>
      section.items.map((entry) => entry.id),
    );

    expect(entries).toContain("unfavorite");
    expect(entries).not.toContain("favorite");
  });

  it("gives a cycle its own actions and no rollover controls", () => {
    const entries = cycleMenuModel(false).flatMap((section) =>
      section.items.map((entry) => entry.id),
    );

    expect(entries).toEqual(
      expect.arrayContaining(["open", "create-issue", "cycle-edit"]),
    );
    expect(entries.join(" ")).not.toMatch(/rollover|sync/);
  });

  it("hides rename, duplicate and delete on a view someone else owns", () => {
    const mine = savedViewMenuModel(false, true).flatMap((section) =>
      section.items.map((entry) => entry.id),
    );
    const theirs = savedViewMenuModel(false, false).flatMap((section) =>
      section.items.map((entry) => entry.id),
    );

    expect(mine).toEqual(
      expect.arrayContaining(["view-rename", "view-duplicate", "view-delete"]),
    );
    expect(theirs).not.toContain("view-delete");
    expect(theirs).toContain("open");
  });

  it("keeps resource links to their own four actions", () => {
    const entries = linkMenuModel().flatMap((section) =>
      section.items.map((entry) => entry.id),
    );

    expect(entries).toEqual([
      "open",
      "copy-link-url",
      "link-rename",
      "link-delete",
    ]);
    expect(entries).not.toContain("status");
  });
});
