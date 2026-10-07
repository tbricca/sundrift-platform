import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listEntityLinks } from "../server/entity-links";
import { iso } from "../server/issue-engine";
import { requireIssue } from "../server/issue-writes";

export default defineAction({
  description:
    "Resource links attached to an issue or a project: specs, designs, dashboards, external tickets. Ordered as they were added.",
  schema: z.object({
    entityType: z.enum(["issue", "project"]),
    entityId: z
      .string()
      .describe("Project id, or an issue id or identifier such as ENG-42."),
  }),
  http: { method: "GET" },
  run: async ({ entityType, entityId }) => {
    // Issues are addressable by identifier everywhere else, so accept both.
    const id =
      entityType === "issue" ? (await requireIssue(entityId)).id : entityId;

    const rows = await listEntityLinks(entityType, id);

    return {
      links: rows.map((row) => ({
        id: row.id,
        url: row.url,
        title: row.title,
        sortOrder: row.sortOrder,
        createdAt: iso(row.createdAt)!,
      })),
    };
  },
});
