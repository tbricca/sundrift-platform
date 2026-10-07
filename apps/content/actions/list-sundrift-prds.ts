import { defineAction } from "@agent-native/core/action";
import { DEMO_PRODUCT_DEV } from "@sundrift/shared";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";

export default defineAction({
  description:
    "List the seeded Sundrift product PRDs for loyalty, packing AI, and returns.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const ids = DEMO_PRODUCT_DEV.map((story) => story.prdId);
    const rows = await getDb()
      .select()
      .from(schema.documents)
      .where(inArray(schema.documents.id, ids));
    const documents = rows.map((row) => ({
      id: row.id,
      title: row.title,
      path: `/page/${row.id}`,
    }));
    return {
      documents,
      count: documents.length,
      summary:
        documents.length === ids.length
          ? "Three Sundrift PRDs are in Content."
          : "PRDs are missing. Run seed-sundrift-prds while signed in.",
    };
  },
});
