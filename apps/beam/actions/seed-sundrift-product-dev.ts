import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { seedSundriftProductIssues } from "../server/sundrift-product-dev";

export default defineAction({
  description:
    "Add Sundrift product-development Beam tickets for loyalty, packing AI, and returns. Idempotent. Requires the demo workspace from seed-demo-data. Does not rename that workspace.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => seedSundriftProductIssues(),
});
