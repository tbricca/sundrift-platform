/**
 * Resource links hang off an issue or a project through a polymorphic column,
 * so the foreign key that would normally guarantee the target exists is not
 * available. This module is that guarantee: every write resolves the target
 * first and confirms it belongs to the workspace.
 *
 * Soft-deleted issues keep their links. The link rows stay in the database and
 * come back with the issue on restore; they are simply unreachable while the
 * issue is, because the only route to them is the issue's own detail view.
 */
import { and, asc, eq } from "drizzle-orm";

import { normalizeUrl } from "../app/lib/entity-links";
import { entityLinks, issues, projects, teams } from "../drizzle/schema";
import { db } from "./db";
import { UserError } from "./issue-writes";

export type LinkEntityType = "issue" | "project";
export type EntityLinkRow = typeof entityLinks.$inferSelect;

/**
 * Confirms the link target exists and sits in `workspaceId`, and returns its
 * canonical id so callers can address an issue by `ENG-42` as well as by id.
 */
export async function resolveLinkTarget(
  entityType: LinkEntityType,
  entityId: string,
  workspaceId: string,
): Promise<string> {
  if (entityType === "project") {
    const [project] = await db
      .select({ id: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(eq(projects.id, entityId))
      .limit(1);
    if (!project) throw new UserError(`Project not found: ${entityId}`, 404);
    if (project.workspaceId !== workspaceId) {
      throw new UserError("That project belongs to a different workspace.");
    }
    return project.id;
  }

  const [issue] = await db
    .select({ id: issues.id, workspaceId: teams.workspaceId })
    .from(issues)
    .innerJoin(teams, eq(issues.teamId, teams.id))
    .where(eq(issues.id, entityId))
    .limit(1);
  if (!issue) throw new UserError(`Issue not found: ${entityId}`, 404);
  if (issue.workspaceId !== workspaceId) {
    throw new UserError("That issue belongs to a different workspace.");
  }
  return issue.id;
}

/**
 * Canonicalises a URL or rejects it. `javascript:` and `data:` are the reason
 * this is server-side and not only a form check.
 */
export function requireSafeUrl(input: string): string {
  const normalized = normalizeUrl(input);
  if (!normalized) {
    throw new UserError(
      "Enter a valid http or https link.",
    );
  }
  return normalized.url;
}

export async function listEntityLinks(
  entityType: LinkEntityType,
  entityId: string,
): Promise<EntityLinkRow[]> {
  return await db
    .select()
    .from(entityLinks)
    .where(
      and(
        eq(entityLinks.entityType, entityType),
        eq(entityLinks.entityId, entityId),
      ),
    )
    .orderBy(asc(entityLinks.sortOrder), asc(entityLinks.createdAt));
}

/** Appends after the current last link, so insertion order is stable. */
export async function nextLinkSortOrder(
  entityType: LinkEntityType,
  entityId: string,
): Promise<number> {
  const rows = await listEntityLinks(entityType, entityId);
  const last = rows[rows.length - 1];
  return (last?.sortOrder ?? 0) + 1000;
}

export async function requireLink(id: string): Promise<EntityLinkRow> {
  const [row] = await db
    .select()
    .from(entityLinks)
    .where(eq(entityLinks.id, id))
    .limit(1);
  if (!row) throw new UserError(`Link not found: ${id}`, 404);
  return row;
}
