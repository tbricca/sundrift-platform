import { readAppSecret } from "@agent-native/core/secrets";
import { getRequestUserEmail } from "@agent-native/core/server/request-context";

/** True when a user-scoped Ahrefs key is stored. Never logs the value. */
export async function ahrefsKeyConfigured(): Promise<boolean> {
  const email = await Promise.resolve(getRequestUserEmail());
  if (!email) return false;
  const stored = await readAppSecret({
    key: "AHREFS_API_KEY",
    scope: "user",
    scopeId: email,
  });
  return Boolean(stored?.value);
}

/**
 * Live keyword fetch seam. Returns null until a real client is added.
 * Callers must keep serving the seeded catalog when this is null.
 */
export async function fetchLiveKeyword(): Promise<null> {
  return null;
}
