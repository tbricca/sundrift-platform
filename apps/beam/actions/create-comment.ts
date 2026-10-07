import { defineAction } from "@agent-native/core/action";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { formatIdentifier, parseIdentifier } from "../app/lib/issue-query";
import { parseMentionIds } from "../app/lib/mentions";
import { db } from "../server/db";
import {
  excerptOf,
  memberName,
  notifyIssueMentions,
  notifyIssueSubscribers,
  subscribeToIssue,
} from "../server/notifications";
import { publishCommentChange } from "../server/realtime";
import { getCurrentMemberId } from "../server/workspace";
import { activities, comments, issues, teams } from "../drizzle/schema";

export default defineAction({
  description:
    "Add a comment to an issue. Defaults to the current member as author; pass authorId to comment as another member or agent.",
  schema: z.object({
    identifier: z
      .string()
      .describe("Issue identifier such as ENG-142, or the raw issue id"),
    body: z
      .string()
      .min(1)
      .describe(
        "Comment body. Mention a member inline as @[Display Name](member:<id>).",
      ),
    authorId: z.string().optional(),
  }),
  run: async ({ identifier, body, authorId }) => {
    const parsed = parseIdentifier(identifier);
    let issueId: string | null = null;

    if (parsed) {
      const [row] = await db
        .select({ id: issues.id })
        .from(issues)
        .innerJoin(teams, eq(issues.teamId, teams.id))
        .where(
          and(
            eq(teams.key, parsed.teamKey),
            eq(issues.identifierNumber, parsed.number),
          ),
        )
        .limit(1);
      issueId = row?.id ?? null;
    }
    if (!issueId) {
      const [row] = await db
        .select({ id: issues.id })
        .from(issues)
        .where(eq(issues.id, identifier))
        .limit(1);
      issueId = row?.id ?? null;
    }
    if (!issueId) throw new Error(`Issue not found: ${identifier}`);

    const userId = authorId ?? (await getCurrentMemberId());
    if (!userId) throw new Error("No member available to author the comment.");

    const [comment] = await db
      .insert(comments)
      .values({ issueId, userId, body, mentions: parseMentionIds(body) })
      .returning();

    await db.insert(activities).values({
      issueId,
      actorId: userId,
      type: "commented",
      metadata: { commentId: comment.id },
    });

    // Commenting subscribes the author, mentions take precedence over the
    // generic comment event, and the author never notifies themselves.
    await subscribeToIssue(issueId, [userId]);

    const [row] = await db
      .select({
        title: issues.title,
        number: issues.identifierNumber,
        key: teams.key,
      })
      .from(issues)
      .innerJoin(teams, eq(issues.teamId, teams.id))
      .where(eq(issues.id, issueId))
      .limit(1);

    const context = {
      issueId,
      identifier: formatIdentifier(row?.key ?? "", row?.number ?? 0),
      title: row?.title ?? "",
      actorId: userId,
      actorName: await memberName(userId),
    };
    const excerpt = excerptOf(body);

    const mentioned = await notifyIssueMentions(context, comment.mentions ?? [], {
      commentId: comment.id,
      excerpt,
    });
    await notifyIssueSubscribers(context, {
      commentId: comment.id,
      excerpt,
      exclude: mentioned,
    });

    publishCommentChange(issueId);

    return { id: comment.id, issueId };
  },
});
