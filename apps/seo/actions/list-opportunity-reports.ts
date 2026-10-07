import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listResearch } from "../server/records.js";

export default defineAction({
  description:
    "List saved SEO opportunity reports. Alias of list-research, shaped for the research home (keyword, country, summary).",
  schema: z.object({
    limit: z.number().int().positive().max(50).optional(),
  }),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async ({ limit }) => {
    const research = await listResearch();
    const reports = research.slice(0, limit ?? 20).map((row) => ({
      id: row.id,
      keyword: row.keyword,
      country: row.country,
      summary: row.summary,
      createdAt: row.createdAt,
      reportKind: row.reportKind,
    }));
    return reports;
  },
});
