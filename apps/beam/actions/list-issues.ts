import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { runIssueQuery } from "../server/issue-engine";
import { issueQuerySchema, toIssueQuery } from "../server/issue-query-schema";

export default defineAction({
  description:
    "Run an issue query and return grouped results. This is the single engine behind every issue surface — team issues, backlog, my issues, cycles, project issues, saved views, list and board. Express the view as filters + grouping + ordering + layout rather than asking for a special-purpose list.",
  schema: z.object({
    query: issueQuerySchema
      .optional()
      .describe(
        "Issue view descriptor: { filters, grouping, ordering, layout, visibleColumns }. Omit for the default view.",
      ),
  }),
  http: { method: "GET" },
  run: async ({ query }) => {
    return await runIssueQuery(
      toIssueQuery(query ?? issueQuerySchema.parse({})),
    );
  },
});
