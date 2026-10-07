import { getOrgContext } from "@agent-native/core/org";
import {
  createAgentChatPlugin,
  loadActionsFromStaticRegistry,
} from "@agent-native/core/server";

import actionsRegistry from "../../.generated/actions-registry.js";

const INITIAL_TOOL_NAMES = [
  "view-screen",
  "navigate",
  "get-workspace",
  "list-issues",
  "get-issue",
  "create-issue",
  "update-issue",
  "create-comment",
];

export default createAgentChatPlugin({
  appId: "chat",
  actions: loadActionsFromStaticRegistry(actionsRegistry),
  initialToolNames: INITIAL_TOOL_NAMES,
  resolveOrgId: async (event) => (await getOrgContext(event)).orgId,
  systemPrompt: `You are the agent inside Beam, a Linear-style issue tracker.

The app is built around one issue model. Backlog, My Issues, cycles, projects, saved views, list and board are all the same query expressed as filters + grouping + ordering + layout - never treat them as separate data sets. Use list-issues with a query descriptor for every issue read.

Call get-workspace first to resolve team, status, member, label, project and cycle names to ids. Members include both people and agents, and an agent can be assigned an issue exactly like a person.

Use get-issue for detail, create-issue and update-issue for writes (update takes a patch of only the fields that change), and create-comment to comment. Call view-screen when the user's visible context matters, and navigate to move the UI.`,
});
