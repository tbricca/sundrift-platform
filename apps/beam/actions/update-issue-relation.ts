import { defineAction } from "@agent-native/core/action";
import { and, eq, or } from "drizzle-orm";
import { z } from "zod";

import { db } from "../server/db";
import {
  UserError,
  canonicalRelation,
  issueRef,
  requireIssue,
} from "../server/issue-writes";
import { getCurrentMemberId } from "../server/workspace";
import { activities, issueRelations } from "../drizzle/schema";

export default defineAction({
  description:
    "Add or remove a relation between two issues (blocks, blocked_by, related, duplicate). Relations are stored once in canonical form, so `A blocked_by B` is the same row as `B blocks A` and can never be duplicated in reverse.",
  schema: z.object({
    identifier: z.string().describe("Issue identifier such as ENG-142, or id"),
    relatedIdentifier: z
      .string()
      .describe("The other issue's identifier or id"),
    type: z.enum(["blocks", "blocked_by", "related", "duplicate"]),
    remove: z.boolean().default(false).describe("Remove instead of add"),
  }),
  run: async (args) => {
    const issue = await requireIssue(args.identifier);
    const related = await requireIssue(args.relatedIdentifier);

    if (issue.id === related.id) {
      throw new UserError("An issue cannot relate to itself.");
    }

    const canonical = canonicalRelation(issue.id, related.id, args.type);
    const actorId = await getCurrentMemberId();

    if (args.remove) {
      await db
        .delete(issueRelations)
        .where(
          and(
            eq(issueRelations.type, canonical.type),
            or(
              and(
                eq(issueRelations.issueId, canonical.issueId),
                eq(issueRelations.relatedIssueId, canonical.relatedIssueId),
              ),
              and(
                eq(issueRelations.issueId, canonical.relatedIssueId),
                eq(issueRelations.relatedIssueId, canonical.issueId),
              ),
            ),
          ),
        );
      await db.insert(activities).values({
        issueId: issue.id,
        actorId,
        type: "relation_removed",
        metadata: {
          field: "relation",
          relationType: args.type,
          from: await issueRef(related.id),
        },
      });
      return { removed: true, type: args.type };
    }

    const [existing] = await db
      .select({ id: issueRelations.id })
      .from(issueRelations)
      .where(
        and(
          eq(issueRelations.type, canonical.type),
          or(
            and(
              eq(issueRelations.issueId, canonical.issueId),
              eq(issueRelations.relatedIssueId, canonical.relatedIssueId),
            ),
            and(
              eq(issueRelations.issueId, canonical.relatedIssueId),
              eq(issueRelations.relatedIssueId, canonical.issueId),
            ),
          ),
        ),
      )
      .limit(1);

    if (existing) return { created: false, id: existing.id, type: args.type };

    const [created] = await db
      .insert(issueRelations)
      .values(canonical)
      .returning();

    await db.insert(activities).values({
      issueId: issue.id,
      actorId,
      type: "relation_added",
      metadata: {
        field: "relation",
        relationType: args.type,
        to: await issueRef(related.id),
      },
    });

    return { created: true, id: created.id, type: args.type };
  },
});
