import { defineAction } from "@agent-native/core/action";
import { DEMO_PRODUCT_DEV } from "@sundrift/shared";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";

import { issues, teams, workspaces } from "../drizzle/schema";
import { db } from "../server/db";
import { DEMO_WORKSPACE_SLUG } from "../server/workspace";

export default defineAction({
  description:
    "List the seeded Sundrift product-development Beam tickets for loyalty, packing AI, and returns.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const titles = DEMO_PRODUCT_DEV.map((story) => story.beamTitle);
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slug, DEMO_WORKSPACE_SLUG))
      .limit(1);
    if (!workspace) {
      return {
        tickets: [],
        summary: "Demo workspace is not seeded yet. Run seed-demo-data, then seed-sundrift-product-dev.",
      };
    }
    const teamRows = await db
      .select()
      .from(teams)
      .where(eq(teams.workspaceId, workspace.id));
    const teamIds = teamRows.map((team) => team.id);
    if (teamIds.length === 0) {
      return { tickets: [], summary: "Demo workspace has no teams." };
    }
    const rows = await db
      .select()
      .from(issues)
      .where(and(inArray(issues.teamId, teamIds), isNull(issues.deletedAt)));
    const tickets = rows
      .filter((row) => titles.includes(row.title))
      .map((row) => {
        const team = teamRows.find((item) => item.id === row.teamId);
        const identifier = `${team?.key ?? "PROD"}-${row.identifierNumber}`;
        return {
          id: row.id,
          title: row.title,
          identifier,
          path: `/issue/${identifier}`,
        };
      });
    return {
      tickets,
      count: tickets.length,
      summary:
        tickets.length === titles.length
          ? "Loyalty, packing AI, and returns tickets are on the board."
          : "Some Sundrift product tickets are missing. Run seed-sundrift-product-dev.",
    };
  },
});
