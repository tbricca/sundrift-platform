import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getResearch } from "../server/records.js";

export default defineAction({
  description:
    "Edit the suggested response on a Sundrift SEO research report. This is a local save, not a model call.",
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
    if (!research) throw new Error(`Research not found: ${id}`);
    return { research, message: "Suggested response saved." };
  },
});
