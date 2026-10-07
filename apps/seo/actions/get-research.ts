import { defineAction } from "@agent-native/core/action";
import { buildDeepLink } from "@agent-native/core/server";
import { z } from "zod";

import { ahrefsKeyConfigured, fetchLiveKeyword } from "../server/ahrefs.js";
import { getResearch } from "../server/records.js";

export default defineAction({
  description:
    "Get one Sundrift SEO research report, including the suggested response, full report, related terms, and SERP snapshot.",
  schema: z.object({
    id: z.string().describe("Research id, such as research_linen_travel_shirts"),
  }),
  http: { method: "GET" },
  readOnly: true,
  parallelSafe: true,
  run: async ({ id }) => {
    const research = await getResearch(id);
    if (!research) {
      throw new Error(`Research not found: ${id}`);
    }
    const live = await fetchLiveKeyword();
    return {
      ...research,
      ahrefsKeyConfigured: await ahrefsKeyConfigured(),
      liveKeyword: live,
      url: buildDeepLink({
        app: "seo",
        view: "report",
        to: research.urlPath,
        params: { researchId: research.id },
      }),
      message: `Research ready for ${research.keyword}.`,
    };
  },
});
