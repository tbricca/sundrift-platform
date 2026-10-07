import { defineAction } from "@agent-native/core/action";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { issueTemplates } from "../drizzle/schema";
import { db } from "../server/db";
import { requireTemplate } from "../server/issue-templates";
import { publishTemplateChange } from "../server/realtime";

export default defineAction({
  description:
    "Permanently delete an issue template and its labels. Prefer update-issue-template with archived: true, which is reversible. Issues already created from the template are unaffected either way.",
  schema: z.object({ id: z.string() }),
  http: { method: "DELETE" },
  run: async ({ id }) => {
    const template = await requireTemplate(id);

    // Label rows cascade with the template.
    await db.delete(issueTemplates).where(eq(issueTemplates.id, template.id));

    publishTemplateChange(template.id, template.teamId);

    return { id: template.id, deleted: true };
  },
});
