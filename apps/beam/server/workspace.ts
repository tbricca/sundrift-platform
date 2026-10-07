import { asc, eq } from "drizzle-orm";

import { members, workspaces } from "../drizzle/schema";
import { db } from "./db";

export const DEMO_WORKSPACE_SLUG = "northwind";

export async function getWorkspace() {
  const [workspace] = await db
    .select()
    .from(workspaces)
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  return workspace ?? null;
}

export async function requireWorkspace() {
  const workspace = await getWorkspace();
  if (!workspace) {
    throw new Error(
      "No workspace found. Run `pnpm action seed-demo-data` to create one.",
    );
  }
  return workspace;
}

/**
 * Auth is disabled in this app, so the first human on the roster acts as the
 * signed-in member for "my issues", comment authorship, and activity actors.
 */
export async function getCurrentMemberId(): Promise<string | null> {
  const [member] = await db
    .select({ id: members.id })
    .from(members)
    .where(eq(members.kind, "human"))
    .orderBy(asc(members.createdAt))
    .limit(1);
  return member?.id ?? null;
}
