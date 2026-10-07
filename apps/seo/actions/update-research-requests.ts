import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getResearch } from "../server/records.js";

export default defineAction({
  description:
    "Save a tailored suggested response on an SEO research request. Local write. Alias of update-research.",
  schema: z.object({
    id: z.string(),
    suggestedResponse: z.string(),
  }),
  http: { method: "PUT" },
  run: async ({ id, suggestedResponse }) => {
    const now = new Date().toISOString();
    await getDb()
      .update(schema.researchReports)
      .set({ suggestedResponse, updatedAt: now })
      .where(eq(schema.researchReports.id, id));
    const research = await getResearch(id);
    if (!research) throw new Error(`Research request not found: ${id}`);
    return { research, message: "Suggested response saved." };
  },
});