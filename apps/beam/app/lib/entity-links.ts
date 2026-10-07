/**
 * Resource links are user-supplied URLs, so everything here is about deciding
 * what is safe to store and what to show when the user did not name the link.
 *
 * Deliberately no network access: the title fallback is derived from the URL
 * itself rather than fetched, so adding a link never blocks on a third party
 * and never leaks the workspace's browsing to one.
 */

/** The only schemes a stored link may use. */
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export type NormalizedUrl = { url: string; hostname: string };

/**
 * Parses and canonicalises a URL, or returns null if it is unusable.
 *
 * A bare `example.com/spec` is treated as https rather than rejected, since
 * that is what people paste. Anything with an explicit non-http(s) scheme —
 * `javascript:`, `data:`, `file:` — is rejected outright: those are the
 * schemes that turn a link into an attack.
 */
export function normalizeUrl(input: string): NormalizedUrl | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return null;
  if (!parsed.hostname || !parsed.hostname.includes(".")) return null;

  // A trailing slash on the bare origin is noise; anywhere else it is a path.
  const url =
    parsed.pathname === "/" && !parsed.search && !parsed.hash
      ? parsed.origin
      : parsed.toString();

  return { url, hostname: parsed.hostname };
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * What to show as the link's name. An explicit title always wins; otherwise
 * the path reads better than the bare host ("figma.com/file/abc" beats
 * "figma.com" when three Figma links sit in a row).
 */
export function linkDisplayTitle(link: {
  title?: string | null;
  url: string;
}): string {
  const title = link.title?.trim();
  if (title) return title;

  try {
    const parsed = new URL(link.url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return path && path !== "/" ? `${host}${path}` : host;
  } catch {
    return link.url;
  }
}

/** Favicon for a link, from the public service the browser can cache. */
export function faviconUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
  } catch {
    return null;
  }
}
