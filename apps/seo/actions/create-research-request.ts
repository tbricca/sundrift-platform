import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { startResearch } from "../server/start-research.js";

export default defineAction({
  description:
    "Create an SEO research request and save the catalog report. Same path as start-research. Does not call Ahrefs.",
  schema: z.object({
    request: z.string().optional(),
    keyword: z.string().min(2),
    country: z.string().default("US"),
    sourceApp: z.string().optional(),
    department: z.string().optional(),
    priority: z.string().optional(),
  }),
  http: { method: "POST" },
  run: async ({ request, keyword, country }) =>
    startResearch({ request, keyword, country }),
});
