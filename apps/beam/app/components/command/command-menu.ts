/**
 * What a menu shows, decided once.
 *
 * Beam has four surfaces offering the same actions - the command palette, the
 * bulk action bar, right-click menus and the issue detail `...` menu - and the
 * rule about *which* actions are legal is genuinely shared: a status picker
 * needs one team, a milestone needs one project, "current cycle" resolves per
 * issue and so always works. Those rules live here, as pure functions over a
 * selection scope, rather than being re-derived in each renderer.
 *
 * This module decides what appears and what is disabled. Rendering belongs to
 * the menu components, execution to `useCommandRunner`, and the catalog of
 * commands remains `COMMANDS`.
 */
import type { PropertyId } from "@/components/issues/properties";

import {
  COMMANDS,
  type CommandContext,
  type CommandId,
  type CommandSpec,
} from "./commands";

/**
 * Menus reach a few things the palette's catalog does not cover: entity-local
 * toggles, and per-entity editors that already have their own action.
 */
export type MenuActionId =
  | CommandId
  | "open"
  | "favorite"
  | "unfavorite"
  | "subscribe"
  | "unsubscribe"
  | "project-status"
  | "project-priority"
  | "project-health"
  | "project-lead"
  | "copy-view-link"
  | "view-rename"
  | "view-duplicate"
  | "view-delete"
  | "copy-link-url"
  | "link-rename"
  | "link-delete";

/** The compatibility facts a menu needs, as produced by `selectionScope`. */
export type MenuScope = {
  /** Every selected issue is on the same team. */
  singleTeam: boolean;
  /** Every selected issue is in the same project (possibly none). */
  sameProject: boolean;
  /** That shared project, when there is one. */
  projectId?: string | null;
};

export type MenuPropertyItem = {
  kind: "property";
  id: PropertyId;
  disabled: boolean;
  /** Shown on the disabled item, so the menu explains itself. */
  reason?: string;
};

export type MenuCommandItem = {
  kind: "command";
  id: MenuActionId;
  label: string;
  destructive?: boolean;
};

export type MenuTriageItem = {
  kind: "triage";
  id: "accept" | "decline" | "snooze";
  label: string;
};

export type MenuItem = MenuPropertyItem | MenuCommandItem | MenuTriageItem;

export type MenuSection = { id: string; items: MenuItem[] };

/** Properties worth offering on an issue menu, in menu order. */
export const ISSUE_MENU_PROPERTIES: PropertyId[] = [
  "status",
  "priority",
  "assignee",
  "labels",
  "project",
  "milestone",
  "cycle",
];

/**
 * Why a property cannot be set across the current selection, or undefined when
 * it can. One definition, used by every surface.
 *
 * Current/next cycle deliberately has no rule here: the server resolves it
 * against each issue's own team, so a mixed selection is fine.
 */
export function propertyBlockedReason(
  property: PropertyId,
  scope: MenuScope,
): string | undefined {
  if (property === "status" || property === "cycle") {
    return scope.singleTeam
      ? undefined
      : "Selection spans teams, which have their own statuses and cycles.";
  }
  if (property === "milestone") {
    if (!scope.sameProject) return "Selection spans projects.";
    if (!scope.projectId) return "Milestones need a project.";
  }
  return undefined;
}

/** The properties a surface may offer, with incompatible ones disabled. */
export function menuProperties(
  properties: PropertyId[],
  scope: MenuScope,
): MenuPropertyItem[] {
  return properties.map((id) => {
    const reason = propertyBlockedReason(id, scope);
    return { kind: "property", id, disabled: Boolean(reason), reason };
  });
}

/**
 * Commands from the registry that apply here, in the order requested. The
 * registry stays the single catalog; menus only choose which entries to show.
 */
export function menuCommands(
  ids: CommandId[],
  ctx: CommandContext,
): MenuCommandItem[] {
  const byId = new Map<CommandId, CommandSpec>(
    COMMANDS.map((command) => [command.id, command]),
  );
  return ids.flatMap((id) => {
    const command = byId.get(id);
    if (!command || !command.available(ctx)) return [];
    return [
      {
        kind: "command" as const,
        id: command.id,
        label: command.label,
        destructive: command.destructive,
      },
    ];
  });
}

export type IssueMenuInput = {
  ctx: CommandContext;
  scope: MenuScope;
  /** Triage surfaces add the review decisions above everything else. */
  triage?: boolean;
  /** Single-issue menus can offer subscription; bulk menus cannot. */
  subscribed?: boolean;
  /** Rows offer Open; the detail view is already open. */
  canOpen?: boolean;
};

/**
 * The issue menu, shared by list rows, board cards, triage rows and the detail
 * `...` menu. Empty sections are dropped; the renderer separates the rest.
 *
 * Ordering is by expected frequency: review decisions first where they apply,
 * then the properties people change all day, then cycle moves, then the
 * clipboard, then lifecycle at the bottom where a destructive click is least
 * likely to be an accident.
 */
export function issueMenuModel({
  ctx,
  scope,
  triage = false,
  subscribed,
  canOpen = false,
}: IssueMenuInput): MenuSection[] {
  const single = ctx.count <= 1;

  const sections: MenuSection[] = [
    {
      id: "open",
      items: canOpen && single ? [item("open", "Open")] : [],
    },
    {
      id: "triage",
      items: triage
        ? [
            { kind: "triage", id: "accept", label: "Accept" },
            { kind: "triage", id: "decline", label: "Decline" },
            { kind: "triage", id: "snooze", label: "Snooze" },
          ]
        : [],
    },
    { id: "properties", items: menuProperties(ISSUE_MENU_PROPERTIES, scope) },
    {
      id: "cycle-targets",
      items: menuCommands(["cycle-current", "cycle-next"], ctx),
    },
    {
      id: "clipboard",
      items: menuCommands(["copy-identifier", "copy-issue-link"], ctx),
    },
    {
      id: "subscription",
      items:
        single && subscribed !== undefined
          ? [
              subscribed
                ? item("unsubscribe", "Unsubscribe")
                : item("subscribe", "Subscribe"),
            ]
          : [],
    },
    {
      id: "lifecycle",
      items: menuCommands(["archive", "unarchive", "delete"], ctx),
    },
  ];

  return sections.filter((section) => section.items.length > 0);
}

/**
 * Project rows. There is no delete: Beam has no project deletion model, and a
 * menu is the wrong place to invent one.
 */
export function projectMenuModel(isFavorite: boolean): MenuSection[] {
  return [
    { id: "open", items: [item("open", "Open")] },
    {
      id: "edit",
      items: [
        item("project-status", "Status"),
        item("project-priority", "Priority"),
        item("project-health", "Health"),
        item("project-lead", "Lead"),
      ],
    },
    {
      id: "create",
      items: [
        item("project-create-milestone", "Milestones"),
        item("project-create-update", "Post update"),
      ],
    },
    {
      id: "utility",
      items: [favoriteItem(isFavorite), item("copy-project-link", "Copy link")],
    },
  ];
}

/** Cycles. Rollover and other maintenance stay out of a user-facing menu. */
export function cycleMenuModel(isFavorite: boolean): MenuSection[] {
  return [
    { id: "open", items: [item("open", "Open")] },
    {
      id: "actions",
      items: [
        item("create-issue", "New issue in cycle"),
        item("cycle-edit", "Edit cycle dates"),
      ],
    },
    {
      id: "utility",
      items: [favoriteItem(isFavorite), item("copy-cycle-link", "Copy link")],
    },
  ];
}

/** Saved views: rename, duplicate and delete belong to the owner only. */
export function savedViewMenuModel(
  isFavorite: boolean,
  isOwn: boolean,
): MenuSection[] {
  return [
    { id: "open", items: [item("open", "Open")] },
    {
      id: "utility",
      items: [favoriteItem(isFavorite), item("copy-view-link", "Copy link")],
    },
    {
      id: "owner",
      items: isOwn
        ? [
            item("view-rename", "Rename"),
            item("view-duplicate", "Duplicate"),
            { ...item("view-delete", "Delete"), destructive: true },
          ]
        : [],
    },
  ].filter((section) => section.items.length > 0);
}

/** Resource links are not issues: only the link's own four actions. */
export function linkMenuModel(): MenuSection[] {
  return [
    {
      id: "link",
      items: [
        item("open", "Open"),
        item("copy-link-url", "Copy URL"),
        item("link-rename", "Edit title"),
        { ...item("link-delete", "Delete"), destructive: true },
      ],
    },
  ];
}

/** Sidebar and Favorites rows stay deliberately small. */
export function favoriteMenuModel(): MenuSection[] {
  return [
    {
      id: "favorite",
      items: [item("open", "Open"), item("unfavorite", "Remove from favorites")],
    },
  ];
}

function item(id: MenuActionId, label: string): MenuCommandItem {
  return { kind: "command", id, label };
}

function favoriteItem(isFavorite: boolean): MenuCommandItem {
  return item(
    isFavorite ? "unfavorite" : "favorite",
    isFavorite ? "Remove from favorites" : "Add to favorites",
  );
}
