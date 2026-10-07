import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { recurringIssueDefinitions } from "../drizzle/schema";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import { runDefinitionNow } from "../server/recurring-issues";
import { getWorkspace } from "../server/workspace";

export default defineAction({
  description:
    "Create this rule's issue right now, without waiting for the schedule. This does NOT consume the next scheduled occurrence: the rule still fires as planned, and the manual run is recorded separately in its history. Works on a disabled rule, since asking explicitly is the point.",
  schema: z.object({
    id: z.string().describe("Recurring rule id."),
  }),
  run: async (args) => {
    const workspace = await getWorkspace();
    if (!workspace) throw new UserError("No workspace.");

    const [definition] = await db
      .select()
      .from(recurringIssueDefinitions)
      .where(eq(recurringIssueDefinitions.id, args.id))
      .limit(1);
    if (!definition) throw new UserError("Recurring rule not found.");
    if (definition.archivedAt) {
      throw new UserError("This rule is archived. Restore it first.");
    }

    const { issueId, error } = await runDefinitionNow(definition);
    if (error) throw new UserError(error);

    return { issueId, ran: true };
  },
});
