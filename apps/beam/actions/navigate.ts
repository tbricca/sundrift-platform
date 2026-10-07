/**
 * Navigate the UI to a view.
 *
 * Writes a navigate command to application state which the UI reads and auto-deletes.
 *
 * Usage:
 *   pnpm action navigate --view=chat
 *   pnpm action navigate --path=/some/route
 *
 * Options:
 *   --view   View name to navigate to
 *   --path   URL path to navigate to
 *   --threadId Chat thread ID to open on the chat route
 */

import { defineAction } from "@agent-native/core/action";
import { writeAppState } from "@agent-native/core/application-state";
import { z } from "zod";

export default defineAction({
  description:
    "Navigate the UI to a specific view or path. Writes a navigate command to application state which the UI reads and auto-deletes.",
  schema: z.object({
    view: z
      .string()
      .optional()
      .describe(
        "View name: chat, issue, team-issues, team-backlog, team-cycles, team-projects, team-views, saved-view, inbox, my-issues, favorites, projects, project, project-issues, project-updates, cycle, views, settings",
      ),
    path: z.string().optional().describe("URL path to navigate to"),
    threadId: z.string().optional().describe("Chat thread ID to open"),
    teamKey: z.string().optional().describe("Team key such as ENG"),
    issueIdentifier: z
      .string()
      .optional()
      .describe("Issue identifier such as ENG-142"),
    projectId: z.string().optional().describe("Project id"),
    cycleId: z
      .string()
      .optional()
      .describe("Cycle id, used with view=cycle and teamKey"),
    viewId: z
      .string()
      .optional()
      .describe("Saved view id, used with view=saved-view"),
  }),
  http: false,
  run: async (args) => {
    if (!args.view && !args.path) {
      throw new Error("At least --view or --path is required.");
    }
    const nav: Record<string, string> = {};
    if (args.view) nav.view = args.view;
    if (args.path) nav.path = args.path;
    if (args.threadId) nav.threadId = args.threadId;
    if (args.teamKey) nav.teamKey = args.teamKey.toUpperCase();
    if (args.issueIdentifier) nav.issueIdentifier = args.issueIdentifier;
    if (args.projectId) nav.projectId = args.projectId;
    if (args.cycleId) nav.cycleId = args.cycleId;
    if (args.viewId) nav.viewId = args.viewId;
    nav._writeId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await writeAppState("navigate", nav);
    return `Navigating to ${args.view || args.path}`;
  },
});
