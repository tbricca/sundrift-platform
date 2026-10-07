import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  activities,
  comments,
  cycles,
  favorites,
  issueLabels,
  issueRelations,
  issues,
  labels,
  members,
  issueSubscribers,
  milestones,
  notifications,
  projectTeams,
  projects,
  savedViews,
  teamMembers,
  teams,
  workflowStatuses,
  workspaceMembers,
  workspaces,
} from "../drizzle/schema";
import { db } from "../server/db";
import { DEMO_WORKSPACE_SLUG } from "../server/workspace";
import { seedSundriftProductIssues } from "../server/sundrift-product-dev";

type StatusSeed = {
  name: string;
  color: string;
  category: "backlog" | "unstarted" | "started" | "completed" | "canceled";
};

const STATUS_SEEDS: StatusSeed[] = [
  { name: "Backlog", color: "#8b8f9c", category: "backlog" },
  { name: "Todo", color: "#5f6672", category: "unstarted" },
  { name: "In Progress", color: "#f0b429", category: "started" },
  { name: "In Review", color: "#7c5cff", category: "started" },
  { name: "Done", color: "#3fb950", category: "completed" },
  { name: "Canceled", color: "#8b8f9c", category: "canceled" },
];

const LABEL_SEEDS = [
  { name: "bug", color: "#e5484d" },
  { name: "feature", color: "#7c5cff" },
  { name: "improvement", color: "#3b82f6" },
  { name: "design", color: "#ec4899" },
  { name: "infra", color: "#0d9488" },
  { name: "docs", color: "#a16207" },
];

const MEMBER_SEEDS = [
  { name: "Ana Reyes", email: "ana@northwind.test", kind: "human" as const },
  { name: "Tom Ito", email: "tom@northwind.test", kind: "human" as const },
  { name: "Priya Shah", email: "priya@northwind.test", kind: "human" as const },
  { name: "Marc Lund", email: "marc@northwind.test", kind: "human" as const },
  { name: "Triage Agent", email: null, kind: "agent" as const },
  { name: "Docs Agent", email: null, kind: "agent" as const },
];

function daysFromNow(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export default defineAction({
  description:
    "Seed the demo workspace with teams, members, workflow statuses, projects, cycles and sample issues. No-op if the workspace already exists.",
  schema: z.object({
    force: z
      .boolean()
      .default(false)
      .describe("Delete and recreate the demo workspace"),
  }),
  http: false,
  agentTool: false,
  run: async ({ force }) => {
    const [existing] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, DEMO_WORKSPACE_SLUG))
      .limit(1);

    if (existing && !force) {
      return { seeded: false, reason: "Workspace already exists." };
    }

    if (existing) {
      await db.delete(notifications);
      await db.delete(favorites);
      await db.delete(savedViews);
      await db.delete(issueRelations);
      await db.delete(activities);
      await db.delete(comments);
      await db.delete(issueLabels);
      await db.delete(issues);
      await db.delete(milestones);
      await db.delete(projectTeams);
      await db.delete(projects);
      await db.delete(cycles);
      await db.delete(workflowStatuses);
      await db.delete(labels);
      await db.delete(teamMembers);
      await db.delete(teams);
      await db.delete(workspaceMembers);
      await db.delete(members);
      await db.delete(workspaces).where(eq(workspaces.id, existing.id));
    }

    const [workspace] = await db
      .insert(workspaces)
      .values({ name: "Northwind", slug: DEMO_WORKSPACE_SLUG })
      .returning();

    const memberRows = await db
      .insert(members)
      .values(MEMBER_SEEDS)
      .returning();
    const byName = (name: string) => {
      const member = memberRows.find((entry) => entry.name === name);
      if (!member) throw new Error(`Seed member missing: ${name}`);
      return member;
    };
    const ana = byName("Ana Reyes");
    const tom = byName("Tom Ito");
    const priya = byName("Priya Shah");
    const marc = byName("Marc Lund");
    const triage = byName("Triage Agent");
    const docsAgent = byName("Docs Agent");

    await db.insert(workspaceMembers).values(
      memberRows.map((member, index) => ({
        workspaceId: workspace.id,
        userId: member.id,
        role: index === 0 ? ("admin" as const) : ("member" as const),
      })),
    );

    const teamRows = await db
      .insert(teams)
      .values([
        {
          workspaceId: workspace.id,
          name: "Engineering",
          key: "ENG",
          description: "Platform, API and client engineering",
          icon: "code",
          color: "#7c5cff",
          // Engineering reviews incoming issues; Product takes them directly.
          triageEnabled: true,
        },
        {
          workspaceId: workspace.id,
          name: "Product",
          key: "PROD",
          description: "Discovery, specs and product design",
          icon: "compass",
          color: "#0d9488",
        },
      ])
      .returning();

    const eng = teamRows.find((team) => team.key === "ENG")!;
    const prod = teamRows.find((team) => team.key === "PROD")!;

    await db.insert(teamMembers).values([
      { teamId: eng.id, userId: ana.id },
      { teamId: eng.id, userId: tom.id },
      { teamId: eng.id, userId: marc.id },
      { teamId: eng.id, userId: triage.id },
      { teamId: prod.id, userId: priya.id },
      { teamId: prod.id, userId: ana.id },
      { teamId: prod.id, userId: docsAgent.id },
    ]);

    const statusRows = await db
      .insert(workflowStatuses)
      .values(
        teamRows.flatMap((team) =>
          STATUS_SEEDS.map((status, index) => ({
            teamId: team.id,
            name: status.name,
            color: status.color,
            category: status.category,
            position: index,
          })),
        ),
      )
      .returning();

    const status = (teamId: string, name: string) => {
      const found = statusRows.find(
        (row) => row.teamId === teamId && row.name === name,
      );
      if (!found) throw new Error(`Seed status missing: ${name}`);
      return found.id;
    };

    const labelRows = await db
      .insert(labels)
      .values(
        LABEL_SEEDS.map((label) => ({
          workspaceId: workspace.id,
          teamId: null,
          name: label.name,
          color: label.color,
        })),
      )
      .returning();
    const label = (name: string) =>
      labelRows.find((row) => row.name === name)!.id;

    const cycleRows = await db
      .insert(cycles)
      .values([
        {
          teamId: eng.id,
          number: 12,
          name: "Cycle 12",
          startsAt: daysFromNow(-5),
          endsAt: daysFromNow(9),
          status: "active" as const,
        },
        {
          teamId: eng.id,
          number: 13,
          name: "Cycle 13",
          startsAt: daysFromNow(10),
          endsAt: daysFromNow(24),
          status: "upcoming" as const,
        },
        {
          teamId: prod.id,
          number: 4,
          name: "Cycle 4",
          startsAt: daysFromNow(-5),
          endsAt: daysFromNow(9),
          status: "active" as const,
        },
      ])
      .returning();
    const engCycle = cycleRows.find(
      (cycle) => cycle.teamId === eng.id && cycle.status === "active",
    )!;
    const prodCycle = cycleRows.find((cycle) => cycle.teamId === prod.id)!;

    const projectRows = await db
      .insert(projects)
      .values([
        {
          workspaceId: workspace.id,
          name: "Realtime Sync",
          summary: "Live updates across every client without refreshes",
          description:
            "Replace polling with a durable event stream so issue boards, detail views and notifications stay current within a second.",
          status: "started" as const,
          priority: "high" as const,
          leadId: ana.id,
          startDate: daysFromNow(-21),
          targetDate: daysFromNow(30),
          health: "on_track" as const,
        },
        {
          workspaceId: workspace.id,
          name: "Onboarding Revamp",
          summary: "Cut time-to-first-issue for new workspaces",
          description:
            "Rebuild the first-run experience: workspace setup, team templates and a guided first issue.",
          status: "planned" as const,
          priority: "medium" as const,
          leadId: priya.id,
          startDate: daysFromNow(-4),
          targetDate: daysFromNow(60),
          health: "at_risk" as const,
        },
      ])
      .returning();
    const sync = projectRows[0];
    const onboarding = projectRows[1];

    await db.insert(projectTeams).values([
      { projectId: sync.id, teamId: eng.id },
      { projectId: onboarding.id, teamId: prod.id },
      { projectId: onboarding.id, teamId: eng.id },
    ]);

    const milestoneRows = await db
      .insert(milestones)
      .values([
        {
          projectId: sync.id,
          name: "Transport spike",
          description: "Pick SSE vs websockets and prove reconnect behaviour",
          targetDate: daysFromNow(-2),
          sortOrder: 1,
        },
        {
          projectId: sync.id,
          name: "Client fan-out",
          description: "Invalidate queries from server events",
          targetDate: daysFromNow(21),
          sortOrder: 2,
        },
        {
          projectId: onboarding.id,
          name: "Setup flow v1",
          targetDate: daysFromNow(35),
          sortOrder: 1,
        },
      ])
      .returning();
    const transportMilestone = milestoneRows[0];
    const fanoutMilestone = milestoneRows[1];

    type IssueSeed = {
      team: typeof eng;
      title: string;
      description?: string;
      status: string;
      priority: "none" | "low" | "medium" | "high" | "urgent";
      assignee?: string | null;
      project?: string | null;
      cycle?: string | null;
      milestone?: string | null;
      estimate?: number;
      due?: number;
      labels?: string[];
      /** Files the issue into the team's triage queue. */
      triage?: { source: string; creator: string };
    };

    const seeds: IssueSeed[] = [
      {
        team: eng,
        title: "Board columns drop issues when dragging quickly",
        description:
          "Reordering two cards within 200ms loses the second write. The optimistic update is applied before the previous mutation settles, so the stale sort order wins.",
        status: "In Progress",
        priority: "urgent",
        assignee: ana.id,
        project: sync.id,
        cycle: engCycle.id,
        estimate: 3,
        due: 3,
        labels: ["bug"],
      },
      {
        team: eng,
        title: "Stream issue updates over SSE",
        description:
          "Publish an event whenever an issue row changes and let clients invalidate only the affected queries.",
        status: "In Progress",
        priority: "high",
        assignee: tom.id,
        project: sync.id,
        cycle: engCycle.id,
        milestone: fanoutMilestone.id,
        estimate: 5,
        labels: ["feature", "infra"],
      },
      {
        team: eng,
        title: "Reconnect backoff for dropped event streams",
        status: "Todo",
        priority: "high",
        assignee: tom.id,
        project: sync.id,
        cycle: engCycle.id,
        milestone: fanoutMilestone.id,
        estimate: 2,
        labels: ["infra"],
      },
      {
        team: eng,
        title: "Benchmark SSE vs websockets under 5k connections",
        status: "Done",
        priority: "medium",
        assignee: marc.id,
        project: sync.id,
        milestone: transportMilestone.id,
        estimate: 3,
        labels: ["infra"],
      },
      {
        team: eng,
        title: "Keyboard shortcut layer for the issue list",
        description:
          "j/k to move, x to select, e to change status, a to assign. Shortcuts must not fire while an input is focused.",
        status: "Todo",
        priority: "medium",
        assignee: ana.id,
        cycle: engCycle.id,
        estimate: 5,
        labels: ["feature"],
      },
      {
        team: eng,
        title: "Virtualize lists beyond 500 rows",
        status: "Backlog",
        priority: "medium",
        assignee: null,
        estimate: 5,
        labels: ["improvement"],
      },
      {
        team: eng,
        title: "Identifier allocation races under concurrent creates",
        description:
          "Two simultaneous creates on the same team can claim the same number. Allocate with a single atomic UPDATE ... RETURNING.",
        status: "Done",
        priority: "urgent",
        assignee: marc.id,
        estimate: 2,
        labels: ["bug"],
      },
      {
        team: eng,
        title: "Auto-triage unassigned bugs",
        description:
          "Route new bug-labelled issues to the on-call engineer and post a summary comment.",
        status: "In Progress",
        priority: "medium",
        assignee: triage.id,
        cycle: engCycle.id,
        estimate: 3,
        labels: ["feature"],
      },
      {
        team: eng,
        title: "Dark mode contrast fails on status pills",
        status: "In Review",
        priority: "low",
        assignee: ana.id,
        estimate: 1,
        labels: ["bug", "design"],
      },
      {
        team: eng,
        title: "Drop the legacy polling endpoint",
        status: "Backlog",
        priority: "low",
        assignee: null,
        project: sync.id,
        labels: ["infra"],
      },
      {
        team: eng,
        title: "Cache workspace bootstrap per request",
        status: "Todo",
        priority: "low",
        assignee: marc.id,
        estimate: 2,
        labels: ["improvement"],
      },
      {
        team: eng,
        title: "Saved views ignore ordering on first load",
        status: "Backlog",
        priority: "medium",
        assignee: null,
        labels: ["bug"],
      },
      {
        team: eng,
        title: "Spike: offline queue for optimistic writes",
        status: "Canceled",
        priority: "none",
        assignee: tom.id,
        labels: ["infra"],
      },
      {
        team: eng,
        title: "Sub-issue progress rollup on the parent",
        status: "Todo",
        priority: "medium",
        assignee: ana.id,
        estimate: 3,
        labels: ["feature"],
      },
      {
        team: eng,
        title: "Emit activity rows for every field change",
        status: "Done",
        priority: "medium",
        assignee: marc.id,
        estimate: 2,
        labels: ["improvement"],
      },
      {
        team: prod,
        title: "Define the first-run setup checklist",
        description:
          "Three steps maximum: name the workspace, create a team, create the first issue.",
        status: "In Progress",
        priority: "high",
        assignee: priya.id,
        project: onboarding.id,
        cycle: prodCycle.id,
        estimate: 3,
        labels: ["design"],
      },
      {
        team: prod,
        title: "Team templates for common workflows",
        status: "Todo",
        priority: "medium",
        assignee: priya.id,
        project: onboarding.id,
        cycle: prodCycle.id,
        estimate: 5,
        labels: ["feature"],
      },
      {
        team: prod,
        title: "Interview five teams about triage habits",
        status: "Done",
        priority: "medium",
        assignee: priya.id,
        estimate: 3,
        labels: ["improvement"],
      },
      {
        team: prod,
        title: "Write the cycles concept doc",
        status: "In Review",
        priority: "low",
        assignee: docsAgent.id,
        project: onboarding.id,
        estimate: 2,
        labels: ["docs"],
      },
      {
        team: prod,
        title: "Pricing page copy refresh",
        status: "Backlog",
        priority: "low",
        assignee: null,
        labels: ["docs"],
      },
      {
        team: prod,
        title: "Decide default workflow statuses for new teams",
        status: "Todo",
        priority: "high",
        assignee: ana.id,
        project: onboarding.id,
        due: 7,
        estimate: 1,
        labels: ["design"],
      },
      {
        team: prod,
        title: "Empty states for every list surface",
        status: "Backlog",
        priority: "medium",
        assignee: null,
        labels: ["design"],
      },
      {
        team: prod,
        title: "Instrument activation funnel",
        status: "Backlog",
        priority: "low",
        assignee: null,
        project: onboarding.id,
        labels: ["improvement"],
      },
      {
        team: prod,
        title: "Deprecate the old import wizard",
        status: "Canceled",
        priority: "none",
        assignee: priya.id,
        labels: ["improvement"],
      },
      {
        team: eng,
        title: "Comment editor loses focus after mention autocomplete",
        description:
          "Selecting a mention with the keyboard blurs the editor, so the next keystroke goes to the page instead of the comment.",
        status: "Backlog",
        priority: "medium",
        assignee: null,
        labels: ["bug"],
        triage: { source: "agent", creator: triage.id },
      },
      {
        team: eng,
        title: "Rate limit the issue export endpoint",
        description:
          "A single client pulled 40k issues in a minute. Cap it per token before it becomes a support ticket.",
        status: "Backlog",
        priority: "high",
        assignee: null,
        labels: ["improvement"],
        triage: { source: "api", creator: triage.id },
      },
      {
        team: eng,
        title: "Keyboard shortcut help is missing on mobile",
        status: "Backlog",
        priority: "low",
        assignee: null,
        triage: { source: "manual", creator: marc.id },
      },
    ];

    const counters = new Map<string, number>();
    const insertedIssues: {
      id: string;
      title: string;
      teamId: string;
      identifier: string;
    }[] = [];

    for (const [index, seed] of seeds.entries()) {
      const next = (counters.get(seed.team.id) ?? 0) + 1;
      counters.set(seed.team.id, next);

      const [row] = await db
        .insert(issues)
        .values({
          teamId: seed.team.id,
          identifierNumber: next,
          title: seed.title,
          description: seed.description ?? null,
          statusId: status(seed.team.id, seed.status),
          priority: seed.priority,
          assigneeId: seed.assignee ?? null,
          projectId: seed.project ?? null,
          cycleId: seed.cycle ?? null,
          milestoneId: seed.milestone ?? null,
          estimate: seed.estimate ?? null,
          dueDate: seed.due ? daysFromNow(seed.due) : null,
          createdBy: seed.triage?.creator ?? ana.id,
          triageStatus: seed.triage ? ("pending" as const) : null,
          triageSource: seed.triage?.source ?? null,
          // Spread creation across the past few weeks. Without this every issue
          // is created "now" yet finishes two days ago, which is not merely
          // untidy: it makes completion time negative and drags the analytics
          // median below zero.
          createdAt: daysFromNow(-10 - (index % 18)),
          completedAt: seed.status === "Done" ? daysFromNow(-2) : null,
          canceledAt: seed.status === "Canceled" ? daysFromNow(-6) : null,
          sortOrder: (index + 1) * 1000,
        })
        .returning();

      insertedIssues.push({
        id: row.id,
        title: row.title,
        teamId: row.teamId,
        identifier: `${seed.team.key}-${next}`,
      });

      if (seed.labels?.length) {
        await db.insert(issueLabels).values(
          seed.labels.map((name) => ({
            issueId: row.id,
            labelId: label(name),
          })),
        );
      }

      await db.insert(activities).values({
        issueId: row.id,
        actorId: ana.id,
        type: "created",
        metadata: { title: row.title },
      });
    }

    for (const team of teamRows) {
      await db
        .update(teams)
        .set({ nextIssueNumber: (counters.get(team.id) ?? 0) + 1 })
        .where(eq(teams.id, team.id));
    }

    const dragBug = insertedIssues[0];
    const sseIssue = insertedIssues[1];
    const backoffIssue = insertedIssues[2];
    const shortcutIssue = insertedIssues[4];

    await db
      .update(issues)
      .set({ parentIssueId: sseIssue.id })
      .where(eq(issues.id, backoffIssue.id));

    await db.insert(issueRelations).values([
      { issueId: sseIssue.id, relatedIssueId: dragBug.id, type: "blocks" },
      {
        issueId: shortcutIssue.id,
        relatedIssueId: dragBug.id,
        type: "related",
      },
    ]);

    await db.insert(comments).values([
      {
        issueId: dragBug.id,
        userId: tom.id,
        body: "Reproduced on a 4x CPU throttle. The second mutation resolves first and its response overwrites the newer sort order.",
      },
      {
        issueId: dragBug.id,
        userId: triage.id,
        body: "Tagged as a regression from the optimistic reorder change. Assigning to Ana since she owns the board renderer.",
      },
      {
        issueId: sseIssue.id,
        userId: ana.id,
        body: "Let's keep the polling fallback until reconnect backoff lands, otherwise a dropped stream looks like a frozen board.",
      },
    ]);

    await db.insert(activities).values([
      {
        issueId: dragBug.id,
        actorId: triage.id,
        type: "assignee_changed",
        metadata: { to: ana.name },
      },
      {
        issueId: dragBug.id,
        actorId: ana.id,
        type: "status_changed",
        metadata: { to: "In Progress" },
      },
      {
        issueId: sseIssue.id,
        actorId: tom.id,
        type: "estimate_changed",
        metadata: { to: 5 },
      },
    ]);

    await db.insert(savedViews).values({
      workspaceId: workspace.id,
      ownerId: ana.id,
      teamId: eng.id,
      name: "Urgent & unassigned",
      filters: {
        teamId: [eng.id],
        priority: ["urgent", "high"],
        assigneeId: [null],
      },
      layout: "list",
      grouping: "priority",
      ordering: [{ field: "priority", direction: "desc" }],
      visibleColumns: ["priority", "identifier", "title", "labels", "assignee"],
      isShared: 1,
    });

    await db.insert(favorites).values([
      {
        userId: ana.id,
        entityType: "team" as const,
        entityId: eng.id,
        sortOrder: 1,
      },
      {
        userId: ana.id,
        entityType: "project" as const,
        entityId: sync.id,
        sortOrder: 2,
      },
      {
        userId: ana.id,
        entityType: "issue" as const,
        entityId: dragBug.id,
        sortOrder: 3,
      },
    ]);

    await db.insert(issueSubscribers).values([
      { issueId: dragBug.id, memberId: ana.id },
      { issueId: sseIssue.id, memberId: ana.id },
    ]);

    await db.insert(notifications).values([
      {
        userId: ana.id,
        actorId: triage.id,
        type: "issue_assigned",
        entityType: "issue" as const,
        entityId: dragBug.id,
        metadata: {
          issueIdentifier: dragBug.identifier,
          issueTitle: dragBug.title,
          actorName: triage.name,
        },
      },
      {
        userId: ana.id,
        actorId: tom.id,
        type: "issue_comment",
        entityType: "issue" as const,
        entityId: sseIssue.id,
        metadata: {
          issueIdentifier: sseIssue.identifier,
          issueTitle: sseIssue.title,
          actorName: tom.name,
          excerpt: "Reconnect logic is in review.",
        },
      },
    ]);

    const productDev = await seedSundriftProductIssues();

    return {
      seeded: true,
      workspace: workspace.name,
      teams: teamRows.length,
      members: memberRows.length,
      issues: insertedIssues.length + productDev.tickets.filter((ticket) => ticket.created).length,
      projects: projectRows.length,
      productDev,
    };
  },
});
