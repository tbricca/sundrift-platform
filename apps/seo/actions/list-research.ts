import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listResearch } from "../server/records.js";

export default defineAction({
  description:
    "List seeded Sundrift SEO opportunity research (linen travel shirts, weekender bags, packing cubes). Read this before opening a report.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const research = await listResearch();
    return {
      research,
      count: research.length,
      summary: `${research.length} research reports are ready.`,
    };
  },
});
