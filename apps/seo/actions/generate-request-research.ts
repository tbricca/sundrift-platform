import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getResearch } from "../server/records.js";

export default defineAction({
  description:
    "Return the saved catalog report for a research request. Does not call Ahrefs and does not overwrite suggestedResponse. The agent should write a tailored answer with update-research-requests.",
  schema: z.object({
    id: z.string(),
  }),
  http: { method: "POST" },
  run: async ({ id }) => {
    const research = await getResearch(id);
    if (!research) throw new Error(`Research request not found: ${id}`);
    return {
      research,
      message:
        "Catalog research is already saved. Write the suggested response with update-research-requests. Do not replace it with a generic keyword template.",
    };
  },
});
