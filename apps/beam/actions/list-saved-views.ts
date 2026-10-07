import { defineAction } from "@agent-native/core/action";
import { and, asc, eq, or } from "drizzle-orm";
import { z } from "zod";

import { favorites, members, savedViews, teams } from "../drizzle/schema";
import { db } from "../server/db";
import { iso } from "../server/issue-engine";
import { rowToQuery } from "../server/saved-views";
import { getCurrentMemberId, getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "List saved issue views the current member can open: their own views plus shared ones. Each view carries the IssueQuery descriptor to feed straight into list-issues.",
  schema: z.object({
    teamId: z
      .string()
      .optional()
      .describe("Only views scoped to this team."),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return { views: [] };
    const currentMemberId = await getCurrentMemberId();

    const visible = currentMemberId
      ? or(eq(savedViews.ownerId, currentMemberId), eq(savedViews.isShared, 1))
      : eq(savedViews.isShared, 1);

    const rows = await db
      .select({ view: savedViews, owner: members, team: teams })
      .from(savedViews)
      .leftJoin(members, eq(savedViews.ownerId, members.id))
      .leftJoin(teams, eq(savedViews.teamId, teams.id))
      .where(
        and(
          eq(savedViews.workspaceId, workspace.id),
          visible,
          args.teamId ? eq(savedViews.teamId, args.teamId) : undefined,
        ),
      )
      .orderBy(asc(savedViews.name));

    const favoriteRows = currentMemberId
      ? await db
          .select()
          .from(favorites)
          .where(
            and(
              eq(favorites.userId, currentMemberId),
              eq(favorites.entityType, "view"),
            ),
          )
      : [];
    const favoriteIds = new Set(favoriteRows.map((row) => row.entityId));

    return {
      currentMemberId,
      views: rows.map(({ view, owner, team }) => ({
        id: view.id,
        name: view.name,
        query: rowToQuery(view),
        teamId: view.teamId,
        teamKey: team?.key ?? null,
        teamName: team?.name ?? null,
        ownerId: view.ownerId,
        ownerName: owner?.name ?? "Unknown",
        isShared: view.isShared === 1,
        isOwn: view.ownerId === currentMemberId,
        isFavorite: favoriteIds.has(view.id),
        createdAt: iso(view.createdAt),
        updatedAt: iso(view.updatedAt),
      })),
    };
  },
});
