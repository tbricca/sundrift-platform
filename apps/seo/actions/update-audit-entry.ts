import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { getAuditEntry } from "../server/records.js";

export default defineAction({
  description:
    "Update one Sundrift SEO audit row: mark it complete or soft-delete it.",
  schema: z.object({
    id: z.string(),
    status: z.enum(["open", "complete"]).optional(),
    deleted: z.boolean().optional(),
  }),
  http: { method: "PUT" },
  run: async ({ id, status, deleted }) => {
    const now = new Date().toISOString();
    await getDb()
      .update(schema.auditEntries)
      .set({
        ...(status ? { status } : {}),
        ...(deleted === true ? { deletedAt: now } : {}),
        ...(deleted === false ? { deletedAt: null } : {}),
        updatedAt: now,
      })
      .where(eq(schema.auditEntries.id, id));
    const entry = await getAuditEntry(id);
    if (!entry) throw new Error(`Audit entry not found: ${id}`);
    return {
      entry,
      message: deleted ? "Audit request removed." : "Audit request updated.",
    };
  },
});
