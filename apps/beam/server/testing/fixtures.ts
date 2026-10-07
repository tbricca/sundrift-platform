/**
 * One small, deterministic workspace that every integration suite starts from,
 * plus thin factories for the rows a test wants to vary.
 *
 * Deliberately not the demo seed: fixtures stay small enough to reason about,
 * ids are fixed strings so failures name something recognisable, and every
 * date is explicit so nothing depends on the wall clock.
 */
import {
  cycles,
  issues,
  labels,
  members,
  milestones,
  projectTeams,
  projects,
  teamMembers,
  teams,
  workflowStatuses,
  workspaceMembers,
  workspaces,
} from "../../drizzle/schema";

import { testDb } from "./database";

/** Fixed clock for every fixture, so cycle and date assertions are stable. */
export const NOW = new Date("2026-03-15T12:00:00.000Z");

const days = (from: Date, count: number) =>
  new Date(from.getTime() + count * 86_400_000);

export const STATUS_SET = [
  { key: "backlog", name: "Backlog", category: "backlog" as const },
  { key: "todo", name: "Todo", category: "unstarted" as const },
  { key: "doing", name: "In Progress", category: "started" as const },
  { key: "done", name: "Done", category: "completed" as const },
  { key: "canceled", name: "Canceled", category: "canceled" as const },
];

export type TeamFixture = {
  id: string;
  key: string;
  /** Status ids keyed by `STATUS_SET` key: `status.eng.done`. */
  status: Record<string, string>;
  currentCycleId: string;
  nextCycleId: string;
};

export type Fixture = {
  workspaceId: string;
  humanA: string;
  humanB: string;
  agentA: string;
  eng: TeamFixture;
  prod: TeamFixture;
  projectA: string;
  projectB: string;
  milestoneA: string;
  milestoneB: string;
  labelBug: string;
  labelFeature: string;
};

async function seedTeam(
  workspaceId: string,
  idPrefix: string,
  name: string,
  key: string,
  memberIds: string[],
  overrides: Partial<typeof teams.$inferInsert> = {},
): Promise<TeamFixture> {
  const teamId = `team-${idPrefix}`;

  await testDb()
    .insert(teams)
    .values({
      id: teamId,
      workspaceId,
      name,
      key,
      cyclesEnabled: true,
      cycleDurationWeeks: 2,
      cycleStartDay: 1,
      cycleAutoCreate: true,
      cycleAutoRollover: true,
      ...overrides,
    });

  await testDb()
    .insert(teamMembers)
    .values(memberIds.map((userId) => ({ teamId, userId })));

  const statusRows = STATUS_SET.map((status, position) => ({
    id: `status-${idPrefix}-${status.key}`,
    teamId,
    name: status.name,
    color: "#8b8fa3",
    category: status.category,
    position,
  }));
  await testDb().insert(workflowStatuses).values(statusRows);

  const currentCycleId = `cycle-${idPrefix}-current`;
  const nextCycleId = `cycle-${idPrefix}-next`;
  await testDb()
    .insert(cycles)
    .values([
      {
        id: currentCycleId,
        teamId,
        number: 1,
        name: null,
        startsAt: days(NOW, -7),
        endsAt: days(NOW, 7),
        status: "active",
      },
      {
        id: nextCycleId,
        teamId,
        number: 2,
        name: null,
        startsAt: days(NOW, 7),
        endsAt: days(NOW, 21),
        status: "upcoming",
      },
    ]);

  return {
    id: teamId,
    key,
    status: Object.fromEntries(
      STATUS_SET.map((status) => [
        status.key,
        `status-${idPrefix}-${status.key}`,
      ]),
    ),
    currentCycleId,
    nextCycleId,
  };
}

/**
 * The canonical baseline: one workspace, two humans and an agent, two teams
 * with a full five-status workflow and two cycles each, two projects with a
 * milestone each, and two labels.
 */
export async function seedTestWorkspace(): Promise<Fixture> {
  const workspaceId = "ws-test";

  await testDb()
    .insert(workspaces)
    .values({ id: workspaceId, name: "Test Workspace", slug: "test" });

  const roster = [
    { id: "member-a", name: "Ana Human", email: "ana@test.dev", kind: "human" as const },
    { id: "member-b", name: "Ben Human", email: "ben@test.dev", kind: "human" as const },
    { id: "member-agent", name: "Aria Agent", email: null, kind: "agent" as const },
  ];
  await testDb().insert(members).values(roster);
  await testDb()
    .insert(workspaceMembers)
    .values(
      roster.map((member, index) => ({
        workspaceId,
        userId: member.id,
        role: index === 0 ? ("admin" as const) : ("member" as const),
      })),
    );

  const memberIds = roster.map((member) => member.id);
  const eng = await seedTeam(workspaceId, "eng", "Engineering", "ENG", memberIds);
  const prod = await seedTeam(workspaceId, "prod", "Product", "PROD", memberIds);

  await testDb()
    .insert(projects)
    .values([
      {
        id: "project-a",
        workspaceId,
        name: "Project A",
        status: "started",
        leadId: "member-a",
        startDate: days(NOW, -30),
        targetDate: days(NOW, 30),
      },
      {
        id: "project-b",
        workspaceId,
        name: "Project B",
        status: "planned",
        leadId: "member-b",
      },
    ]);
  await testDb()
    .insert(projectTeams)
    .values([
      { projectId: "project-a", teamId: eng.id },
      { projectId: "project-b", teamId: prod.id },
    ]);

  await testDb()
    .insert(milestones)
    .values([
      { id: "milestone-a", projectId: "project-a", name: "Alpha", sortOrder: 0 },
      { id: "milestone-b", projectId: "project-b", name: "Beta", sortOrder: 0 },
    ]);

  await testDb()
    .insert(labels)
    .values([
      { id: "label-bug", workspaceId, teamId: null, name: "Bug", color: "#e5484d" },
      {
        id: "label-feature",
        workspaceId,
        teamId: null,
        name: "Feature",
        color: "#3e63dd",
      },
    ]);

  return {
    workspaceId,
    humanA: "member-a",
    humanB: "member-b",
    agentA: "member-agent",
    eng,
    prod,
    projectA: "project-a",
    projectB: "project-b",
    milestoneA: "milestone-a",
    milestoneB: "milestone-b",
    labelBug: "label-bug",
    labelFeature: "label-feature",
  };
}

let issueCounter = 0;

/**
 * Inserts an issue directly, bypassing `create-issue`, so a test can set up a
 * starting state without depending on the action under test.
 */
export async function createTestIssue(
  team: TeamFixture,
  overrides: Partial<typeof issues.$inferInsert> = {},
): Promise<typeof issues.$inferSelect> {
  issueCounter += 1;
  const [row] = await testDb()
    .insert(issues)
    .values({
      teamId: team.id,
      identifierNumber: overrides.identifierNumber ?? issueCounter,
      title: overrides.title ?? `Test issue ${issueCounter}`,
      statusId: overrides.statusId ?? team.status.todo,
      createdBy: overrides.createdBy ?? "member-a",
      createdAt: overrides.createdAt ?? NOW,
      updatedAt: overrides.updatedAt ?? NOW,
      ...overrides,
    })
    .returning();
  return row;
}

/** Resets the per-run identifier counter so numbering restarts with the data. */
export function resetIssueCounter(): void {
  issueCounter = 0;
}

export const identifierOf = (team: TeamFixture, issue: { identifierNumber: number }) =>
  `${team.key}-${issue.identifierNumber}`;
