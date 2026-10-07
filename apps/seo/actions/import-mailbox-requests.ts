import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listAuditLog } from "../server/records.js";
import { restoreMailboxImports } from "../server/seed.js";

export default defineAction({
  description:
    "Import seeded Sundrift mailbox requests into the SEO audit log. Restores trashed email rows. Does not call Gmail.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const restored = await restoreMailboxImports();
    const entries = await listAuditLog();
    return {
      restored,
      entries,
      message:
        restored > 0
          ? `Imported ${restored} mailbox request${restored === 1 ? "" : "s"}.`
          : "Mailbox requests are already in the audit log.",
    };
  },
});
