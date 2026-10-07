import { defineAction } from "@agent-native/core/action";
import { DEMO_PLAN_ID } from "@sundrift/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import { planPath } from "../server/plans.js";

export default defineAction({
  description:
    "Get the seeded Sundrift product-development plan for loyalty, packing AI, and returns.",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async () => {
    const [plan] = await getDb()
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, DEMO_PLAN_ID))
      .limit(1);
    if (!plan) {
      return {
        plan: null,
        summary: "The product plan is not seeded. Run seed-sundrift-plans.",
      };
    }
    return {
      plan: {
        id: plan.id,
        title: plan.title,
        brief: plan.brief,
        status: plan.status,
        path: planPath(plan.id),
      },
      summary: "Sundrift product plan is ready.",
    };
  },
});
