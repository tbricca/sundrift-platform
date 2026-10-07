import { and, eq, isNull } from "drizzle-orm";

import { DEMO_PRODUCT_DEV } from "@sundrift/shared";

import { issues, members, teams, workflowStatuses, workspaces } from "../drizzle/schema";
import { db } from "./db";
import { DEMO_WORKSPACE_SLUG } from "./workspace";

const STORY_TITLES = DEMO_PRODUCT_DEV.map((story) => story.beamTitle);

export async function seedSundriftProductIssues() {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.slug, DEMO_WORKSPACE_SLUG))
    .limit(1);
  if (!workspace) {
    return {
      seeded: false,
      reason: "Run seed-demo-data before adding Sundrift product tickets.",
      tickets: [],
    };
  }

  const teamRows = await db
    .select()
    .from(teams)
    .where(eq(teams.workspaceId, workspace.id));
  const team = teamRows.find((row) => row.key === "PROD") ?? teamRows[0];
  if (!team) {
    return {
      seeded: false,
      reason: "The demo workspace has no team.",
      tickets: [],
    };
  }

  const statusRows = await db
    .select()
    .from(workflowStatuses)
    .where(eq(workflowStatuses.teamId, team.id));
  const status =
    statusRows.find((row) => row.name === "Todo") ?? statusRows[0];
  if (!status) {
    return {
      seeded: false,
      reason: "The product team has no workflow status.",
      tickets: [],
    };
  }

  const [priya] = await db
    .select()
    .from(members)
    .where(eq(members.name, "Priya Shah"))
    .limit(1);

  const existing = await db
    .select()
    .from(issues)
    .where(and(eq(issues.teamId, team.id), isNull(issues.deletedAt)));
  const tickets = [];
  let nextNumber = team.nextIssueNumber;

  for (const story of DEMO_PRODUCT_DEV) {
    const found = existing.find((issue) => issue.title === story.beamTitle);
    if (found) {
      tickets.push({
        id: found.id,
        title: found.title,
        identifier: `${team.key}-${found.identifierNumber}`,
        path: `/issue/${team.key}-${found.identifierNumber}`,
        prdPath: `/content/page/${story.prdId}`,
        created: false,
      });
      continue;
    }
    const number = nextNumber;
    nextNumber += 1;
    const [row] = await db
      .insert(issues)
      .values({
        teamId: team.id,
        identifierNumber: number,
        title: story.beamTitle,
        description: `${story.summary}\n\nContent PRD: /content/page/${story.prdId}\nPlan: /plan/plans/plan-sundrift-product-dev`,
        statusId: status.id,
        priority: "high",
        assigneeId: priya?.id ?? null,
        createdBy: priya?.id ?? null,
        sortOrder: number * 1000,
      })
      .returning();
    tickets.push({
      id: row.id,
      title: row.title,
      identifier: `${team.key}-${number}`,
      path: `/issue/${team.key}-${number}`,
      prdPath: `/content/page/${story.prdId}`,
      created: true,
    });
  }

  if (nextNumber !== team.nextIssueNumber) {
    await db
      .update(teams)
      .set({ nextIssueNumber: nextNumber })
      .where(eq(teams.id, team.id));
  }

  return {
    seeded: true,
    workspace: workspace.name,
    tickets,
    titles: STORY_TITLES,
  };
}
