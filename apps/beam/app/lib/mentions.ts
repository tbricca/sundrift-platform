/**
 * Mentions are stored inline as `@[Display Name](member:<id>)` so the member id
 * survives renames and edits. A denormalised `mentions` id array is written
 * alongside the text on every save, which is what a later Inbox pass reads.
 */

const MENTION_PATTERN = /@\[([^\]]+)\]\(member:([^)]+)\)/g;

export type MentionToken =
  | { type: "text"; value: string }
  | { type: "mention"; memberId: string; label: string };

export function encodeMention(memberId: string, name: string): string {
  return `@[${name}](member:${memberId})`;
}

export function parseMentionIds(text: string | null | undefined): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  for (const match of text.matchAll(MENTION_PATTERN)) ids.add(match[2]);
  return [...ids];
}

/**
 * Ids present after an edit that were not there before. Editing a body only
 * notifies people who were newly named; removing a mention notifies nobody and
 * never retracts an existing notification.
 */
export function newMentionIds(
  previous: string[] | null | undefined,
  next: string[] | null | undefined,
): string[] {
  const before = new Set(previous ?? []);
  return [...new Set(next ?? [])].filter((id) => !before.has(id));
}

export function tokenizeMentions(text: string): MentionToken[] {
  const tokens: MentionToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MENTION_PATTERN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      tokens.push({ type: "text", value: text.slice(lastIndex, start) });
    }
    tokens.push({ type: "mention", label: match[1], memberId: match[2] });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) {
    tokens.push({ type: "text", value: text.slice(lastIndex) });
  }
  return tokens;
}

/** Plain-text form used for previews and search. */
export function stripMentions(text: string): string {
  return text.replace(MENTION_PATTERN, (_full, label: string) => `@${label}`);
}

/**
 * Finds an in-progress `@query` immediately before the caret so the composer
 * can show member autocomplete. Returns null when the caret is not in a
 * mention.
 */
export function activeMentionQuery(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const upToCaret = value.slice(0, caret);
  const at = upToCaret.lastIndexOf("@");
  if (at === -1) return null;

  const before = at === 0 ? "" : upToCaret[at - 1];
  if (before && !/\s|\(/.test(before)) return null;

  const query = upToCaret.slice(at + 1);
  if (/[\]()]/.test(query) || /\s{2,}/.test(query) || query.includes("\n")) {
    return null;
  }
  if (query.length > 40) return null;

  return { query, start: at };
}
