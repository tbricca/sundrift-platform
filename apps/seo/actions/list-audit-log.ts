import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listAuditLog } from "../server/records.js";

export default defineAction({
  description:
    "List the Sundrift SEO audit log, including SEO research requests and seeded mailbox imports. Deleted rows are hidden.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const entries = await listAuditLog();
    return {
      entries,
      count: entries.length,
      summary: `${entries.length} audit requests are in the log.`,
    };
  },
});
