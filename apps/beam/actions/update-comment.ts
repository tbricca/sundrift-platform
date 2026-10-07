import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier } from "../app/lib/issue-query";
import { newMentionIds, parseMentionIds } from "../app/lib/mentions";
import { db } from "../server/db";
import { UserError } from "../server/issue-writes";
import {
  excerptOf,
  memberName,
  notifyIssueMentions,
} from "../server/notifications";
import { publishCommentChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";
import { comments, issues, teams } from "../drizzle/schema";

export default defineAction({
  description:
    "Edit or delete a comment. Only the comment's own author may change it. Deletion is soft so the activity feed stays intact.",
  schema: z.object({
    commentId: z.string(),
    body: z.string().min(1).optional().describe("New body; omit when deleting"),
    delete: z.boolean().default(false),
  }),
  http: { method: "PUT" },
  run: async (args) => {
    const [comment] = await db
      .select()
      .from(comments)
      .where(eq(comments.id, args.commentId))
      .limit(1);
    if (!comment) throw new UserError("Comment not found.", 404);

    const currentMemberId = await getCurrentMemberId();
    if (comment.userId !== currentMemberId) {
      throw new UserError("You can only change your own comments.", 403);
    }

    if (args.delete) {
      await db
        .update(comments)
        .set({ deletedAt: new Date() })
        .where(eq(comments.id, comment.id));
      publishCommentChange(comment.issueId);
      return { id: comment.id, deleted: true };
    }

    if (!args.body) throw new UserError("A new body is required.");

    const mentions = parseMentionIds(args.body);
    await db
      .update(comments)
      .set({ body: args.body, mentions, updatedAt: new Date() })
      .where(eq(comments.id, comment.id));

    // Only members named for the first time hear about an edit.
    const added = newMentionIds(comment.mentions, mentions);
    if (added.length) {
      const [row] = await db
        .select({
          title: issues.title,
          number: issues.identifierNumber,
          key: teams.key,
        })
        .from(issues)
        .innerJoin(teams, eq(issues.teamId, teams.id))
        .where(eq(issues.id, comment.issueId))
        .limit(1);

      await notifyIssueMentions(
        {
          issueId: comment.issueId,
          identifier: formatIdentifier(row?.key ?? "", row?.number ?? 0),
          title: row?.title ?? "",
          actorId: currentMemberId,
          actorName: await memberName(currentMemberId),
        },
        added,
        { commentId: comment.id, excerpt: excerptOf(args.body) },
      );
    }

    publishCommentChange(comment.issueId);

    return { id: comment.id, updated: true };
  },
});
