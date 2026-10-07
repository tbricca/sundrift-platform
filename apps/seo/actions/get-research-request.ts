import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getResearch } from "../server/records.js";

export default defineAction({
  description:
    "Read one SEO research request and its saved report. Alias of get-research.",
  schema: z.object({
    id: z.string(),
  }),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async ({ id }) => {
    const research = await getResearch(id);
    if (!research) throw new Error(`Research request not found: ${id}`);
    return { research, id: research.id, reportId: research.id };
  },
});
