/**
 * The right-click menu for an issue, used by list rows, board cards, triage
 * rows and the issue detail menu.
 *
 * It owns no behaviour: `issueMenuModel` decides what to show, `PROPERTY_DEFS`
 * supplies the option lists, and `useCommandRunner` executes. That is what
 * keeps a status change from a right-click identical to one from the palette
 * or the bulk bar.
 */
import type { ReactNode } from "react";

import {
  issueMenuModel,
  type MenuCommandItem,
  type MenuSection,
} from "@/components/command/command-menu";
import type { CommandContext } from "@/components/command/commands";
import {
  PROPERTY_DEFS,
  type PropertyContext,
  type PropertyId,
  type PropertyOption,
} from "@/components/issues/properties";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useCommandRunner, type CommandTarget } from "@/hooks/use-command-runner";
import type { IssueListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

export type TriageAction = "accept" | "decline" | "snooze";

type Props = {
  /** Issues the menu acts on: one row, or the whole selection. */
  issues: IssueListItem[];
  ctx: PropertyContext;
  commandContext: CommandContext;
  scope: { singleTeam: boolean; sameProject: boolean; projectId?: string | null };
  triage?: boolean;
  subscribed?: boolean;
  onTriage?: (action: TriageAction, issues: IssueListItem[]) => void;
  /** Fired before the menu opens, so a surface can adjust the selection. */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

export function IssueContextMenu({
  issues,
  ctx,
  commandContext,
  scope,
  triage,
  subscribed,
  onTriage,
  onOpenChange,
  children,
}: Props) {
  const runner = useCommandRunner();
  const sections = issueMenuModel({
    ctx: commandContext,
    scope,
    triage,
    subscribed,
    canOpen: true,
  });

  const target: CommandTarget = {
    issues,
    ctx,
    path: issues[0] ? `/issue/${issues[0].identifier}` : undefined,
  };

  return (
    <ContextMenu onOpenChange={onOpenChange}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        {issues.length > 1 ? (
          <div className="beam-meta px-2 py-1.5">
            {issues.length} issues selected
          </div>
        ) : null}

        <MenuSections
          sections={sections}
          renderProperty={(property, disabled, reason) => (
            <PropertySubmenu
              key={property}
              property={property}
              disabled={disabled}
              reason={reason}
              ctx={ctx}
              onPick={(option) => runner.applyProperty(target, property, option)}
            />
          )}
          renderCommand={(item) => (
            <ContextMenuItem
              key={item.id}
              className={cn("text-[13px]", item.destructive && "text-destructive")}
              onSelect={() => runner.runCommand(item.id, target)}
            >
              {item.label}
            </ContextMenuItem>
          )}
          renderTriage={(item) => (
            <ContextMenuItem
              key={item.id}
              className="text-[13px]"
              onSelect={() => onTriage?.(item.id, issues)}
            >
              {item.label}
            </ContextMenuItem>
          )}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Renders model sections with separators, dropping empty ones. */
export function MenuSections({
  sections,
  renderProperty,
  renderCommand,
  renderTriage,
}: {
  sections: MenuSection[];
  renderProperty?: (
    property: PropertyId,
    disabled: boolean,
    reason: string | undefined,
  ) => ReactNode;
  renderCommand: (item: MenuCommandItem) => ReactNode;
  renderTriage?: (item: { id: TriageAction; label: string }) => ReactNode;
}) {
  return (
    <>
      {sections.map((section, index) => (
        <div key={section.id}>
          {index > 0 ? <ContextMenuSeparator /> : null}
          {section.items.map((item) => {
            if (item.kind === "property") {
              return renderProperty?.(item.id, item.disabled, item.reason);
            }
            if (item.kind === "triage") {
              return renderTriage?.(item);
            }
            return renderCommand(item);
          })}
        </div>
      ))}
    </>
  );
}

/**
 * A property becomes a submenu of its own options, straight from the registry,
 * so a new status or a new label appears here without anyone editing a menu.
 */
function PropertySubmenu({
  property,
  disabled,
  reason,
  ctx,
  onPick,
}: {
  property: PropertyId;
  disabled: boolean;
  reason?: string;
  ctx: PropertyContext;
  onPick: (option: PropertyOption) => void;
}) {
  const def = PROPERTY_DEFS[property];

  if (disabled) {
    return (
      <ContextMenuItem disabled className="text-[13px]" title={reason}>
        {def.label}
        <span className="beam-meta ms-auto truncate">Unavailable</span>
      </ContextMenuItem>
    );
  }

  const options = def.options(ctx);

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger className="text-[13px]">
        {def.label}
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="max-h-72 w-52 overflow-y-auto">
        {options.length === 0 ? (
          <ContextMenuItem disabled className="text-[13px]">
            Nothing to choose
          </ContextMenuItem>
        ) : (
          options.map((option) => (
            <ContextMenuItem
              key={String(option.value)}
              className="gap-2 text-[13px]"
              onSelect={() => onPick(option)}
            >
              {option.icon}
              <span className="truncate">{option.label}</span>
              {option.group ? (
                <span className="beam-meta ms-auto">{option.group}</span>
              ) : null}
            </ContextMenuItem>
          ))
        )}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
