import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { getAuditEntry } from "../server/records.js";

export default defineAction({
  description:
    "Prepare an audit-log delivery. Email returns a mailto body. Slack returns the message and does not post. Copy returns plain text.",
  schema: z.object({
    id: z.string(),
    channel: z.enum(["email", "slack", "clipboard"]),
  }),
  http: { method: "POST" },
  run: async ({ id, channel }) => {
    const entry = await getAuditEntry(id);
    if (!entry) throw new Error(`Audit entry not found: ${id}`);
    const subject = `Sundrift SEO: ${entry.summary}`;
    const body = `${entry.summary}\n\n${entry.detail}\n\nChannel: ${entry.channel} / ${entry.team}`;
    if (channel === "slack") {
      return {
        delivered: false,
        channel,
        subject,
        body,
        message:
          "Slack is not connected. The message is ready. Use provider-api-request after Slack is connected.",
      };
    }
    if (channel === "email") {
      const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      return {
        delivered: false,
        channel,
        subject,
        body,
        mailto,
        message: "Email draft is ready in the mailto link. Nothing was sent.",
      };
    }
    return {
      delivered: false,
      channel,
      subject,
      body,
      message: "Copied text is ready. Paste it where you need it.",
    };
  },
});
