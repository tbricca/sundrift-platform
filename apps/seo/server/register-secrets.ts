import { registerRequiredSecret } from "@agent-native/core/secrets";

registerRequiredSecret({
  key: "AHREFS_API_KEY",
  label: "Ahrefs API key",
  description:
    "Optional. The conference demo uses a seeded Ahrefs-style catalog and does not call Ahrefs. A future live lookup can read this key without changing the research screens.",
  docsUrl: "https://docs.ahrefs.com/docs/api/reference/api-keys",
  scope: "user",
  kind: "api-key",
  usedFor: [
    {
      appId: "seo",
      feature: "Live keyword lookup",
      effectWhenRemoved:
        "Research keeps using the seeded Sundrift catalog.",
    },
  ],
  required: false,
  validator: async (value) => {
    if (!value) return true;
    if (value.trim().length < 8) {
      return { ok: false, error: "That key looks too short." };
    }
    return true;
  },
});
