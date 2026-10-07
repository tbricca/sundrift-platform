/**
 * The decision rules behind realtime, kept pure so they can be tested without
 * a socket.
 *
 * The transport (one shared SSE stream, see `use-beam-realtime`) only delivers
 * envelopes; everything about *whether* an event should touch the cache — is
 * this our own echo, is it out of order, what should a reconnect refetch —
 * lives here.
 */

export type BeamEntity =
  | "issue"
  | "comment"
  | "notification"
  | "project"
  | "cycle"
  | "view"
  | "template"
  | "link";

/** What the server puts on the wire. Ids let handlers stay targeted. */
export type BeamChangeEvent = {
  entity: BeamEntity;
  id?: string;
  /**
   * `issues.version`, present on issue events. Drives ordering.
   *
   * Named apart from the envelope's own `version` on purpose: the change log
   * stamps every event with a cursor under that name, which would silently
   * overwrite the entity version and poison the ordering guard.
   */
  issueVersion?: number;
  /** Present on comment events so the right detail pane refreshes. */
  issueId?: string;
  /** Present on link events: which detail surface owns the link. */
  linkEntity?: "issue" | "project";
  /** Present on template events, so the team's list can refresh. */
  teamId?: string;
  projectId?: string;
  cycleId?: string;
  /** The issue left or entered triage, so team counts must refresh. */
  triage?: boolean;
  deleted?: boolean;
  /** Tab that caused the write, when the server knew it. */
  tabId?: string;
};

const ENTITIES: BeamEntity[] = [
  "issue",
  "comment",
  "notification",
  "project",
  "cycle",
  "view",
  "template",
  "link",
];

/** Reads a Beam event out of a raw framework sync envelope. */
export function parseBeamEvent(raw: unknown): BeamChangeEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const event = raw as Record<string, unknown>;
  if (event.source !== "beam") return null;
  const entity = event.entity;
  if (typeof entity !== "string") return null;
  if (!ENTITIES.includes(entity as BeamEntity)) return null;

  return {
    entity: entity as BeamEntity,
    id: typeof event.id === "string" ? event.id : undefined,
    issueVersion:
      typeof event.issueVersion === "number" ? event.issueVersion : undefined,
    issueId: typeof event.issueId === "string" ? event.issueId : undefined,
    projectId:
      typeof event.projectId === "string" ? event.projectId : undefined,
    cycleId: typeof event.cycleId === "string" ? event.cycleId : undefined,
    linkEntity:
      event.linkEntity === "issue" || event.linkEntity === "project"
        ? event.linkEntity
        : undefined,
    teamId: typeof event.teamId === "string" ? event.teamId : undefined,
    triage: event.triage === true,
    deleted: event.deleted === true,
    tabId: typeof event.tabId === "string" ? event.tabId : undefined,
  };
}

export type RealtimeVerdict = "apply" | "echo" | "stale";

export type RealtimeState = {
  /** This tab's id; events it caused are its own echo. */
  tabId: string;
  /** Entity id → timestamp until which a local write is still settling. */
  pending: Map<string, number>;
  /** Entity id → highest version this tab has already seen. */
  versions: Map<string, number>;
  now: number;
};

/**
 * Whether an event should touch the cache.
 *
 * - `echo`: this tab caused it. The optimistic patch is already correct, and
 *   refetching underneath it is exactly what produces the flicker and the
 *   selection reset we are avoiding.
 * - `stale`: an older version of an entity this tab already holds. Events can
 *   arrive out of order after a reconnect; applying one would roll the issue
 *   backwards.
 */
export function realtimeVerdict(
  event: BeamChangeEvent,
  state: RealtimeState,
): RealtimeVerdict {
  if (event.tabId && event.tabId === state.tabId) return "echo";

  const key = event.entity === "comment" ? event.issueId : event.id;
  if (key) {
    const settlingUntil = state.pending.get(key);
    if (settlingUntil !== undefined && settlingUntil > state.now) return "echo";

    if (event.issueVersion !== undefined) {
      const known = state.versions.get(key);
      if (known !== undefined && event.issueVersion <= known) return "stale";
    }
  }

  return "apply";
}

/** Caches a reconnect should refetch, given where the user is standing. */
export type ReconnectTarget =
  "issueLists" | "issueDetail" | "inbox" | "project" | "cycle" | "workspace";

/**
 * A reconnect cannot replay what was missed, so it refetches what is visible
 * rather than everything: the surface in front of the user, whatever is open
 * on top of it, and the two counters that live in the shell.
 */
export function reconnectTargets(
  pathname: string,
  hasOpenIssue: boolean,
): ReconnectTarget[] {
  const targets: ReconnectTarget[] = ["inbox", "workspace"];

  if (hasOpenIssue || /^\/issue\//.test(pathname)) targets.push("issueDetail");

  if (
    /^\/team\/[^/]+\/(issues|backlog|triage)$/.test(pathname) ||
    /^\/team\/[^/]+\/cycles\/[^/]+$/.test(pathname) ||
    /^\/projects\/[^/]+\/issues$/.test(pathname) ||
    /^\/views\/[^/]+$/.test(pathname) ||
    pathname === "/my-issues" ||
    pathname === "/favorites"
  ) {
    targets.push("issueLists");
  }

  if (/^\/projects\//.test(pathname)) targets.push("project");
  if (/^\/team\/[^/]+\/cycles/.test(pathname)) targets.push("cycle");

  return targets;
}

/**
 * Adopt a remote text change only when the user has not touched the field.
 *
 * Beam does not do collaborative text editing: if there is unsaved local text
 * it always wins, and the caller shows a quiet "changed" hint instead.
 */
export function reconcileEditableText(
  local: string,
  previousServer: string,
  nextServer: string,
): { value: string; stale: boolean } {
  if (local === nextServer) return { value: nextServer, stale: false };
  // Untouched since the last server value: safe to take the new one.
  if (local === previousServer) return { value: nextServer, stale: false };
  return { value: local, stale: true };
}
