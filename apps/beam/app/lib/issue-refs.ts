/**
 * Recognising `ENG-42` inside descriptions and comments, so a reference typed
 * in prose becomes a link without anyone having to paste a URL.
 *
 * The hard part is not matching, it is *not* matching: "COVID-19", "UTF-8" and
 * the tail of a pasted URL all look like identifiers. Two rules keep it
 * conservative — the prefix must be a real team key in this workspace, and
 * code spans, code blocks and URLs are skipped entirely.
 *
 * This is display-only. Recognising a reference never creates an issue
 * relation; that stays an explicit action.
 */

export type IssueRefToken =
  | { type: "text"; value: string }
  | { type: "issueRef"; identifier: string; teamKey: string; number: number };

/** Fenced blocks and inline code, which are quoted verbatim. */
const CODE_PATTERN = /```[\s\S]*?```|`[^`\n]*`/g;

/** Bare URLs, whose path segments often look like identifiers. */
const URL_PATTERN = /\b(?:https?:\/\/|www\.)\S+/g;

const REF_PATTERN = /\b([A-Za-z][A-Za-z0-9]{0,7})-(\d{1,9})\b/g;

/**
 * Splits text into plain runs and issue references.
 *
 * `teamKeys` is the set of keys that exist in the workspace; anything else is
 * left as text. Matching is case-insensitive because Beam's own routes accept
 * a lowercase identifier.
 */
export function tokenizeIssueRefs(
  text: string,
  teamKeys: Iterable<string>,
): IssueRefToken[] {
  const keys = new Set([...teamKeys].map((key) => key.toUpperCase()));
  if (keys.size === 0) return text ? [{ type: "text", value: text }] : [];

  const skipped = protectedRanges(text);
  const tokens: IssueRefToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(REF_PATTERN)) {
    const start = match.index!;
    const teamKey = match[1].toUpperCase();
    if (!keys.has(teamKey)) continue;
    if (skipped.some(([from, to]) => start >= from && start < to)) continue;

    if (start > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    tokens.push({
      type: "issueRef",
      identifier: `${teamKey}-${match[2]}`,
      teamKey,
      number: Number(match[2]),
    });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}

/** Every identifier referenced in a body, deduplicated and in order. */
export function issueRefsIn(
  text: string,
  teamKeys: Iterable<string>,
): string[] {
  const seen = new Set<string>();
  for (const token of tokenizeIssueRefs(text, teamKeys)) {
    if (token.type === "issueRef") seen.add(token.identifier);
  }
  return [...seen];
}

function protectedRanges(text: string): [number, number][] {
  const ranges: [number, number][] = [];
  for (const pattern of [CODE_PATTERN, URL_PATTERN]) {
    for (const match of text.matchAll(pattern)) {
      ranges.push([match.index!, match.index! + match[0].length]);
    }
  }
  return ranges;
}
