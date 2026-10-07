import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { projects } from "../drizzle/schema";
import { getProjectAnalytics } from "../server/analytics";
import { db } from "../server/db";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Delivery figures for one project: issues completed out of the total, completed and total estimate points, median and 75th-percentile completion time, completions in the trailing 30 days, and a weekly completion trend. Covers the issues the project holds now — Beam does not record project reassignment history, so work moved between projects counts towards its current one. Read-only.",
  schema: z.object({
    projectId: z.string().describe("Project id."),
  }),
  http: { method: "GET" },
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) return null;

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, args.projectId))
      .limit(1);
    if (!project) return null;

    return await getProjectAnalytics({
      projectId: project.id,
      now: new Date(),
    });
  },
});
