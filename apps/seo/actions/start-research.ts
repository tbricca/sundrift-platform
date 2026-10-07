import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { startResearch } from "../server/start-research.js";

export default defineAction({
  description:
    "Start Sundrift SEO opportunity research for a product keyword and country. Uses the seeded catalog. Unknown keywords get a labeled illustrative stub, not a live Ahrefs call.",
  schema: z.object({
    keyword: z.string().min(1).describe("Product keyword, such as linen travel shirts"),
    country: z.string().default("US").describe("Country code, such as US"),
    request: z
      .string()
      .optional()
      .describe("The question merchandising asked"),
  }),
  http: { method: "POST" },
  run: async (args) => startResearch(args),
});
