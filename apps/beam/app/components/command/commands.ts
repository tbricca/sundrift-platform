/**
 * Command definitions, kept separate from the palette chrome so the list stays
 * readable and testable.
 *
 * Property commands are not written out by hand: they are generated from the
 * issue-property registry, so a new property or a new status appears in the
 * palette without anyone touching this file.
 */
import type { PropertyId } from "@/components/issues/properties";
import type { ShortcutId } from "@/lib/shortcuts";

export type CommandContext = {
  /** How many issues the command will act on, 0 when none are selected. */
  count: number;
  hasIssue: boolean;
  hasTeam: boolean;
  hasProject: boolean;
  hasCycle: boolean;
  inInbox: boolean;
  /** The route's team has a triage queue turned on. */
  hasTriage: boolean;
  /** At least one target issue is archived. */
  anyArchived: boolean;
  /** Every target issue is archived. False when there are no targets. */
  allArchived: boolean;
};

export type CommandId =
  | "create-issue"
  | "create-issue-from-template"
  | "create-project"
  | "create-cycle"
  | "go-my-issues"
  | "go-projects"
  | "go-views"
  | "go-current-cycle"
  | "go-team-analytics"
  | "go-team-recurring"
  | "cycle-current"
  | "cycle-next"
  | "copy-identifier"
  | "copy-issue-link"
  | "copy-project-link"
  | "copy-cycle-link"
  | "archive"
  | "unarchive"
  | "delete"
  | "project-create-milestone"
  | "project-create-update"
  | "cycle-edit"
  | "keyboard-shortcuts"
  | "search-workspace"
  | "go-inbox"
  | "go-triage"
  | "inbox-mark-all-read";

export type CommandSpec = {
  id: CommandId;
  label: string;
  /** Extra search terms: "sprint" should find the cycle commands. */
  keywords?: string;
  group: "Issue" | "Project" | "Cycle" | "Create" | "Navigate";
  /** Only for direct, stable bindings — the palette stays quiet otherwise. */
  shortcut?: ShortcutId;
  destructive?: boolean;
  available: (ctx: CommandContext) => boolean;
};

const always = () => true;
const withIssues = (ctx: CommandContext) => ctx.count > 0 || ctx.hasIssue;
/** Copy commands only make sense for exactly one issue. */
const singleIssue = (ctx: CommandContext) => ctx.count <= 1 && ctx.hasIssue;

export const COMMANDS: CommandSpec[] = [
  {
    id: "create-issue",
    label: "Create issue",
    keywords: "new task add",
    group: "Create",
    shortcut: "issue.create",
    available: always,
  },
  {
    id: "create-issue-from-template",
    label: "Create issue from template",
    keywords: "new task template prefill boilerplate",
    group: "Create",
    available: always,
  },
  {
    id: "create-project",
    label: "Create project",
    keywords: "new initiative",
    group: "Create",
    available: always,
  },
  {
    id: "create-cycle",
    label: "Create cycle",
    keywords: "new sprint iteration",
    group: "Create",
    available: (ctx) => ctx.hasTeam,
  },
  {
    id: "cycle-current",
    label: "Move to current cycle",
    keywords: "sprint iteration active this",
    group: "Issue",
    available: withIssues,
  },
  {
    id: "cycle-next",
    label: "Move to next cycle",
    keywords: "sprint iteration upcoming defer push",
    group: "Issue",
    available: withIssues,
  },
  {
    id: "copy-identifier",
    label: "Copy issue identifier",
    keywords: "clipboard id reference",
    group: "Issue",
    available: singleIssue,
  },
  {
    id: "copy-issue-link",
    label: "Copy issue link",
    keywords: "clipboard url share",
    group: "Issue",
    available: singleIssue,
  },
  {
    id: "archive",
    label: "Archive",
    keywords: "hide close out",
    group: "Issue",
    // Hidden once every target is already archived, so the palette never
    // offers a no-op.
    available: (ctx) => withIssues(ctx) && !ctx.allArchived,
  },
  {
    id: "unarchive",
    label: "Unarchive",
    keywords: "restore unhide bring back",
    group: "Issue",
    available: (ctx) => withIssues(ctx) && ctx.anyArchived,
  },
  {
    id: "delete",
    label: "Delete",
    keywords: "remove trash",
    group: "Issue",
    destructive: true,
    available: withIssues,
  },
  {
    id: "project-create-milestone",
    label: "Create milestone",
    keywords: "project phase target",
    group: "Project",
    available: (ctx) => ctx.hasProject,
  },
  {
    id: "project-create-update",
    label: "Post project update",
    keywords: "status health report",
    group: "Project",
    available: (ctx) => ctx.hasProject,
  },
  {
    id: "copy-project-link",
    label: "Copy project link",
    keywords: "clipboard url share",
    group: "Project",
    available: (ctx) => ctx.hasProject,
  },
  {
    id: "cycle-edit",
    label: "Edit cycle dates",
    keywords: "sprint reschedule",
    group: "Cycle",
    available: (ctx) => ctx.hasCycle,
  },
  {
    id: "copy-cycle-link",
    label: "Copy cycle link",
    keywords: "clipboard url share",
    group: "Cycle",
    available: (ctx) => ctx.hasCycle,
  },
  {
    id: "go-triage",
    label: "Go to Triage",
    keywords: "review queue intake pending",
    group: "Navigate",
    available: (ctx) => ctx.hasTriage,
  },
  {
    id: "search-workspace",
    label: "Search workspace",
    keywords: "find lookup issues projects cycles views members",
    group: "Navigate",
    shortcut: "app.search",
    available: always,
  },
  {
    id: "keyboard-shortcuts",
    label: "Keyboard shortcuts",
    keywords: "help keys hotkeys reference cheatsheet",
    group: "Navigate",
    shortcut: "app.help",
    available: always,
  },
  {
    id: "go-team-analytics",
    label: "Go to Team analytics",
    keywords: "metrics throughput completed created trend chart",
    group: "Navigate",
    available: (ctx) => ctx.hasTeam,
  },
  {
    id: "go-team-recurring",
    label: "Go to Recurring issues",
    keywords: "repeating schedule cadence weekly daily monthly automation rule",
    group: "Navigate",
    available: (ctx) => ctx.hasTeam,
  },
  {
    id: "go-inbox",
    label: "Go to Inbox",
    keywords: "notifications unread mentions",
    group: "Navigate",
    available: always,
  },
  {
    id: "inbox-mark-all-read",
    label: "Mark all notifications read",
    keywords: "inbox clear unread",
    group: "Navigate",
    available: (ctx) => ctx.inInbox,
  },
  {
    id: "go-my-issues",
    label: "Go to My Issues",
    keywords: "assigned to me",
    group: "Navigate",
    available: always,
  },
  {
    id: "go-projects",
    label: "Go to Projects",
    group: "Navigate",
    available: always,
  },
  {
    id: "go-views",
    label: "Go to Views",
    keywords: "saved filters",
    group: "Navigate",
    available: always,
  },
];

/** Which properties are worth a nested palette flow, in menu order. */
export const PALETTE_PROPERTIES: PropertyId[] = [
  "status",
  "assignee",
  "priority",
  "labels",
  "project",
  "milestone",
  "cycle",
  "dueDate",
  "estimate",
];

/** Property flows that also have a direct key, shown as a palette hint. */
export const PROPERTY_SHORTCUTS: Partial<Record<PropertyId, ShortcutId>> = {
  status: "issue.status",
  priority: "issue.priority",
  assignee: "issue.assignee",
  labels: "issue.labels",
};

export const PROPERTY_KEYWORDS: Partial<Record<PropertyId, string>> = {
  status: "state done todo progress move",
  assignee: "owner assign person agent",
  priority: "urgent high low importance",
  labels: "tag add remove",
  cycle: "sprint iteration",
  dueDate: "deadline date",
  estimate: "points size",
};
