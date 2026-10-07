/**
 * Every ranking decision in global search lives here.
 *
 * The SQL layer only decides which rows *could* match; this module decides
 * what "best match" means, so the rules are one pure function that tests can
 * pin down rather than an ORDER BY spread across five queries.
 */

/** Entity tie-breaker when two rows score the same. */
export const ENTITY_WEIGHT = {
  issue: 5,
  project: 4,
  cycle: 3,
  view: 2,
  member: 1,
} as const;

export type SearchEntity = keyof typeof ENTITY_WEIGHT;

/** Below this length only identifiers and name prefixes are searched. */
export const MIN_TEXT_QUERY = 2;
/** Comments are only scanned once the query is specific enough to be useful. */
export const MIN_COMMENT_QUERY = 3;

const SCORE = {
  identifierExact: 1000,
  identifierNumber: 700,
  identifierPrefix: 600,
  nameExact: 500,
  namePrefix: 400,
  wordPrefix: 300,
  contains: 200,
  description: 100,
  comment: 60,
} as const;

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * `ENG-42`, `eng 42` and a bare `42` all mean "look for that issue number".
 * A bare number has no team, so it matches the number in every team.
 */
export function parseIdentifierQuery(
  query: string,
): { teamKey: string | null; number: number } | null {
  const match = /^([a-z]{1,8})?[\s-]*(\d{1,9})$/i.exec(normalize(query));
  if (!match) return null;
  return {
    teamKey: match[1] ? match[1].toUpperCase() : null,
    number: Number(match[2]),
  };
}

/** Prefix/contains scoring shared by titles, project names, view names. */
export function scoreText(text: string | null, query: string): number {
  if (!text) return 0;
  const haystack = normalize(text);
  const needle = normalize(query);
  if (!needle) return 0;
  if (haystack === needle) return SCORE.nameExact;
  if (haystack.startsWith(needle)) return SCORE.namePrefix;
  // A match at a word boundary reads as more intentional than mid-word.
  if (haystack.includes(` ${needle}`)) return SCORE.wordPrefix;
  if (haystack.includes(needle)) return SCORE.contains;
  return 0;
}

export type IssueCandidate = {
  identifier: string;
  title: string;
  description: string | null;
  /** Set when the row was pulled in by a comment body match. */
  commentMatched?: boolean;
  updatedAt?: string | null;
};

export function scoreIssue(issue: IssueCandidate, query: string): number {
  const needle = normalize(query);
  const identifier = normalize(issue.identifier);
  const parsed = parseIdentifierQuery(query);

  if (identifier === needle) return SCORE.identifierExact;
  if (parsed) {
    // `42` should still find ENG-42, just below an exact `ENG-42`.
    const number = identifier.split("-")[1];
    if (!parsed.teamKey && number === String(parsed.number)) {
      return SCORE.identifierNumber;
    }
    if (identifier.startsWith(needle)) return SCORE.identifierPrefix;
  }
  if (identifier.startsWith(needle)) return SCORE.identifierPrefix;

  const title = scoreText(issue.title, query);
  if (title) return title;
  if (scoreText(issue.description, query)) return SCORE.description;
  if (issue.commentMatched) return SCORE.comment;
  return 0;
}

/**
 * Sort by score, then by entity priority, then by recency so repeated searches
 * are stable. Rows that scored zero are dropped: they only matched because the
 * SQL net is deliberately wider than the ranking rules.
 */
export function rankBy<T>(
  items: T[],
  score: (item: T) => number,
  recency?: (item: T) => string | null | undefined,
): T[] {
  return items
    .map((item) => ({ item, score: score(item) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aTime = recency?.(a.item) ?? "";
      const bTime = recency?.(b.item) ?? "";
      return bTime.localeCompare(aTime);
    })
    .map((entry) => entry.item);
}
