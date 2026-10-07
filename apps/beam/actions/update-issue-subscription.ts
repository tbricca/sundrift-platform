import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { UserError, requireIssue } from "../server/issue-writes";
import { subscribeToIssue, unsubscribeFromIssue } from "../server/notifications";
import { getCurrentMemberId } from "../server/workspace";

export default defineAction({
  description:
    "Subscribe or unsubscribe a member from an issue's notifications. Defaults to the current member. Subscribing is otherwise automatic when you create, are assigned, comment on or are mentioned in an issue.",
  schema: z.object({
    identifier: z
      .string()
      .describe("Issue identifier such as ENG-142, or the raw issue id"),
    subscribed: z.boolean(),
    memberId: z
      .string()
      .optional()
      .describe("Defaults to the current member; humans and agents both work"),
  }),
  http: { method: "PUT" },
  run: async ({ identifier, subscribed, memberId }) => {
    const issue = await requireIssue(identifier);
    const target = memberId ?? (await getCurrentMemberId());
    if (!target) throw new UserError("No member to subscribe.", 403);

    if (subscribed) await subscribeToIssue(issue.id, [target]);
    else await unsubscribeFromIssue(issue.id, target);

    return { issueId: issue.id, memberId: target, subscribed };
  },
});
