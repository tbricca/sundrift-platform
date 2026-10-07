/**
 * The single source of truth for every keyboard shortcut in Beam.
 *
 * Execution stays in `use-shortcuts` (one window listener, priority stack);
 * this file owns the *metadata*. Handlers key their maps off `keys(id)` so the
 * help sheet, palette hints and tooltips can never drift from what actually
 * runs.
 */

export type ShortcutCategory =
  | "Navigation"
  | "Issues"
  | "Selection"
  | "Inbox"
  | "Triage"
  | "Editing";

/** Conditions a shortcut needs, surfaced as a small note in the help sheet. */
export type ShortcutRequirement =
  | "focused-issue"
  | "issue-target"
  | "selection"
  | "issue-view"
  | "inbox"
  | "triage"
  | "dialog";

export const REQUIREMENT_LABEL: Record<ShortcutRequirement, string> = {
  "focused-issue": "Requires a focused row",
  "issue-target": "Requires focused or selected issues",
  selection: "Requires selected issues",
  "issue-view": "In a list, board or Inbox",
  inbox: "In the Inbox",
  triage: "In the Triage queue",
  dialog: "In a dialog or editor",
};

export type ShortcutDef = {
  id: ShortcutId;
  /** Token emitted by `shortcutKey()` — also the handler-map key. */
  keys: string;
  /** Extra tokens the handler should answer to (layout differences). */
  aliases?: string[];
  label: string;
  category: ShortcutCategory;
  description?: string;
  requires?: ShortcutRequirement;
  /** Set false for internal bindings that would only add noise to the sheet. */
  inHelp?: boolean;
};

export type ShortcutId =
  | "app.palette"
  | "app.search"
  | "app.help"
  | "nav.next"
  | "nav.prev"
  | "nav.open"
  | "nav.escape"
  | "issue.create"
  | "issue.status"
  | "issue.priority"
  | "issue.assignee"
  | "issue.labels"
  | "select.toggle"
  | "select.all"
  | "select.extendDown"
  | "select.extendUp"
  | "inbox.toggleRead"
  | "triage.accept"
  | "triage.decline"
  | "triage.snooze"
  | "edit.submit";

const DEFS: ShortcutDef[] = [
  {
    id: "app.palette",
    keys: "Mod+k",
    label: "Command palette",
    category: "Navigation",
    description: "Search commands, issues properties and places",
  },
  {
    id: "app.search",
    keys: "/",
    label: "Search workspace",
    category: "Navigation",
    description: "Find issues, projects, cycles, views and members",
  },
  {
    id: "app.help",
    keys: "?",
    // Most layouts report Shift while typing "?".
    aliases: ["Shift+?", "Shift+/"],
    label: "Keyboard shortcuts",
    category: "Navigation",
  },
  {
    id: "nav.next",
    keys: "j",
    label: "Next item",
    category: "Navigation",
    requires: "issue-view",
  },
  {
    id: "nav.prev",
    keys: "k",
    label: "Previous item",
    category: "Navigation",
    requires: "issue-view",
  },
  {
    id: "nav.open",
    keys: "Enter",
    label: "Open focused item",
    category: "Navigation",
    requires: "focused-issue",
  },
  {
    id: "inbox.toggleRead",
    keys: "u",
    label: "Mark read or unread",
    category: "Inbox",
    requires: "inbox",
  },
  {
    id: "nav.escape",
    keys: "Escape",
    label: "Close or clear",
    category: "Navigation",
    description: "Closes the top-most picker, dialog or overlay, then clears selection",
  },
  {
    id: "issue.create",
    keys: "c",
    label: "Create issue",
    category: "Issues",
  },
  {
    id: "issue.status",
    keys: "s",
    label: "Change status",
    category: "Issues",
    requires: "issue-target",
  },
  {
    id: "issue.priority",
    keys: "p",
    label: "Change priority",
    category: "Issues",
    requires: "issue-target",
  },
  {
    id: "issue.assignee",
    keys: "a",
    label: "Assign",
    category: "Issues",
    requires: "issue-target",
  },
  {
    id: "issue.labels",
    keys: "l",
    label: "Add label",
    category: "Issues",
    requires: "issue-target",
  },
  {
    id: "select.toggle",
    keys: "x",
    label: "Toggle selection",
    category: "Selection",
    requires: "focused-issue",
  },
  {
    id: "select.all",
    keys: "Mod+a",
    label: "Select all issues",
    category: "Selection",
    requires: "issue-view",
  },
  {
    id: "select.extendDown",
    keys: "Shift+J",
    label: "Extend selection down",
    category: "Selection",
    requires: "issue-view",
  },
  {
    id: "select.extendUp",
    keys: "Shift+K",
    label: "Extend selection up",
    category: "Selection",
    requires: "issue-view",
  },
  {
    id: "triage.accept",
    keys: "a",
    label: "Accept issue",
    category: "Triage",
    description: "Opens the accept panel with defaults filled in",
    requires: "triage",
  },
  {
    id: "triage.decline",
    keys: "d",
    label: "Decline issue",
    category: "Triage",
    requires: "triage",
  },
  {
    id: "triage.snooze",
    keys: "z",
    label: "Snooze until tomorrow",
    category: "Triage",
    requires: "triage",
  },
  {
    id: "edit.submit",
    keys: "Mod+Enter",
    label: "Save and close",
    category: "Editing",
    requires: "dialog",
  },
];

export const SHORTCUTS: ShortcutDef[] = DEFS;

const BY_ID = new Map(DEFS.map((def) => [def.id, def]));

export function shortcut(id: ShortcutId): ShortcutDef {
  const def = BY_ID.get(id);
  if (!def) throw new Error(`Unknown shortcut: ${id}`);
  return def;
}

/** The handler-map key for a shortcut. Use this instead of a literal. */
export function keys(id: ShortcutId): string {
  return shortcut(id).keys;
}

/** Every token a handler should register, including layout aliases. */
export function keyTokens(id: ShortcutId): string[] {
  const def = shortcut(id);
  return [def.keys, ...(def.aliases ?? [])];
}

/** Mouse interactions worth documenting, kept apart from real shortcuts. */
export const INTERACTION_TIPS: { keys: string; label: string }[] = [
  { keys: "Mod+Click", label: "Toggle selection" },
  { keys: "Shift+Click", label: "Select range" },
];

export const CATEGORY_ORDER: ShortcutCategory[] = [
  "Navigation",
  "Issues",
  "Selection",
  "Inbox",
  "Triage",
  "Editing",
];

export function shortcutsByCategory(): {
  category: ShortcutCategory;
  items: ShortcutDef[];
}[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: DEFS.filter(
      (def) => def.category === category && def.inHelp !== false,
    ),
  })).filter((group) => group.items.length > 0);
}

export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const source = `${navigator.platform ?? ""} ${navigator.userAgent ?? ""}`;
  return /mac|iphone|ipad|ipod/i.test(source);
}

const APPLE_LABELS: Record<string, string> = {
  Mod: "⌘",
  Alt: "⌥",
  Shift: "⇧",
  Enter: "↵",
  Escape: "Esc",
};

const OTHER_LABELS: Record<string, string> = {
  Mod: "Ctrl",
  Alt: "Alt",
  Shift: "Shift",
  Enter: "Enter",
  Escape: "Esc",
};

/**
 * Turn a handler token such as `Mod+k` into display parts for the current
 * platform: `["⌘", "K"]` on macOS, `["Ctrl", "K"]` elsewhere.
 */
export function keyLabels(token: string, apple = isApplePlatform()): string[] {
  const labels = apple ? APPLE_LABELS : OTHER_LABELS;
  return token.split("+").map((part) => {
    if (labels[part]) return labels[part];
    return part.length === 1 ? part.toUpperCase() : part;
  });
}
