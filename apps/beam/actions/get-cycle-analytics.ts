import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getCycleAnalytics } from "../server/analytics";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Delivery figures for one cycle, with the previous finished cycle alongside for comparison: issues done out of what the cycle holds, estimate points done out of the total, completion rate and median completion time. Does NOT report committed scope, carryover or velocity — Beam stores only an issue's current cycle, and rollover moves unfinished issues forward without leaving a record, so those numbers cannot be derived honestly. Read-only.",
  schema: z.object({
    cycleId: z.string().describe("Cycle id."),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    return await getCycleAnalytics(args.cycleId);
  },
});
