import { defineAction } from "@agent-native/core/action";
import {
  getRequestOrgId,
  getRequestUserEmail,
} from "@agent-native/core/server/request-context";
import {
  DEMO_PLAN_BRIEF,
  DEMO_PLAN_ID,
  DEMO_PLAN_TITLE,
  DEMO_PRODUCT_DEV,
  demoPlanMarkdown,
} from "@sundrift/shared";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema } from "../server/db/index.js";
import {
  requirePlanOwnerEmailForWrite,
  resolvePlanOrgIdForWrite,
} from "../server/lib/local-identity.js";
import { newId, nowIso, planPath } from "../server/plans.js";

export default defineAction({
  description:
    "Seed one Sundrift product-development plan covering loyalty, packing AI, and returns, with links to the Content PRDs and Beam ticket titles. Idempotent.",
  schema: z.object({}),
  http: { method: "POST" },
  run: async () => {
    const requesterEmail = getRequestUserEmail();
    const ownerEmail = requirePlanOwnerEmailForWrite(
      requesterEmail ?? undefined,
      "Seeding the Sundrift product plan",
    );
    const orgId = resolvePlanOrgIdForWrite(
      requesterEmail ?? undefined,
      getRequestOrgId() ?? undefined,
    );
    const db = getDb();
    const [existing] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, DEMO_PLAN_ID))
      .limit(1);
    if (existing) {
      return {
        created: false,
        planId: existing.id,
        title: existing.title,
        path: planPath(existing.id),
        summary: "The Sundrift product plan is already in Plan.",
      };
    }

    const now = nowIso();
    const markdown = demoPlanMarkdown();
    await db.insert(schema.plans).values({
      id: DEMO_PLAN_ID,
      title: DEMO_PLAN_TITLE,
      brief: DEMO_PLAN_BRIEF,
      status: "review",
      source: "manual",
      currentFocus: "product development walkthrough",
      markdown,
      createdAt: now,
      updatedAt: now,
      ownerEmail,
      orgId: orgId ?? null,
      visibility: "private",
    });
    await db.insert(schema.planSections).values(
      DEMO_PRODUCT_DEV.map((story, index) => ({
        id: newId("sec"),
        planId: DEMO_PLAN_ID,
        type: index === 0 ? ("summary" as const) : ("implementation" as const),
        title: story.planSectionTitle,
        body: `${story.summary}\n\nContent PRD: /content/page/${story.prdId}\nBeam ticket: ${story.beamTitle}`,
        html: null,
        order: index,
        createdBy: "agent" as const,
        createdAt: now,
        updatedAt: now,
      })),
    );

    return {
      created: true,
      planId: DEMO_PLAN_ID,
      title: DEMO_PLAN_TITLE,
      path: planPath(DEMO_PLAN_ID),
      summary: "Sundrift product plan is ready for review.",
    };
  },
});
