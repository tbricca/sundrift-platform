import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import type { WorkspaceSearchResults } from "../app/lib/types";
import { SEARCH_LIMITS, searchWorkspace } from "../server/search";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Search the whole workspace by text: issues (identifier, title, description, comments), projects, cycles, saved views and members. Use it to find an existing record when you only know part of its name or identifier. For building an issue *view* — filtering, grouping, sorting — use list-issues instead. Unlike list-issues, this includes issues awaiting triage, and archived, completed and canceled issues.",
  schema: z.object({
    query: z
      .string()
      .describe(
        "Free text. An issue identifier such as ENG-42 ranks that issue first; a bare number matches that issue number in any team. Queries shorter than 2 characters only match identifiers and name prefixes.",
      ),
    limit: z
      .object({
        issues: z.number().int().min(1).max(25).optional(),
        projects: z.number().int().min(1).max(25).optional(),
        cycles: z.number().int().min(1).max(25).optional(),
        views: z.number().int().min(1).max(25).optional(),
        members: z.number().int().min(1).max(25).optional(),
      })
      .optional()
      .describe(
        `Per-entity result caps. Defaults: ${JSON.stringify(SEARCH_LIMITS)}.`,
      ),
  }),
  http: { method: "GET" },
  run: async ({ query, limit }): Promise<WorkspaceSearchResults> => {
    const workspace = await getWorkspace();
    if (!workspace) {
      return {
        query: "",
        issues: [],
        projects: [],
        cycles: [],
        views: [],
        members: [],
      };
    }
    return await searchWorkspace(workspace.id, query, limit ?? {});
  },
});
