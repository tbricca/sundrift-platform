import { defineAction } from "@agent-native/core/action";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { listAuditLog } from "../server/records.js";

export default defineAction({
  description: "Mark selected Sundrift SEO audit requests complete.",
  schema: z.object({
    ids: z.array(z.string()).min(1),
  }),
  http: { method: "POST" },
  run: async ({ ids }) => {
    const now = new Date().toISOString();
    await getDb()
      .update(schema.auditEntries)
      .set({ status: "complete", updatedAt: now })
      .where(inArray(schema.auditEntries.id, ids));
    const entries = await listAuditLog();
    return {
      completed: ids.length,
      entries,
      message: `Marked ${ids.length} request${ids.length === 1 ? "" : "s"} complete.`,
    };
  },
});
