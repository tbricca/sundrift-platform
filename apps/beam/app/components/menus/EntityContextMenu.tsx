/**
 * The right-click menu for everything that is not an issue: projects, cycles,
 * saved views, favorites and resource links.
 *
 * These entities have their own small action sets rather than the shared issue
 * command catalog, so this renders a model and reports the chosen id. The
 * caller maps that id onto the action it already uses elsewhere - the point is
 * one menu primitive and one set of behaviours, not one giant switch.
 */
import type { ReactNode } from "react";

import type { MenuActionId, MenuSection } from "@/components/command/command-menu";
import type { PropertyOption } from "@/components/issues/properties";
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
import { cn } from "@/lib/utils";

/** Option lists a caller wants rendered as a submenu, keyed by action id. */
export type EntitySubmenus = Partial<
  Record<
    MenuActionId,
    { options: PropertyOption[]; onPick: (option: PropertyOption) => void }
  >
>;

export function EntityContextMenu({
  sections,
  submenus,
  onSelect,
  header,
  children,
}: {
  sections: MenuSection[];
  submenus?: EntitySubmenus;
  onSelect: (id: MenuActionId) => void;
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-48">
        {header ? <div className="beam-meta px-2 py-1.5">{header}</div> : null}
        {sections.map((section, index) => (
          <div key={section.id}>
            {index > 0 || header ? <ContextMenuSeparator /> : null}
            {section.items.map((entry) => {
              if (entry.kind !== "command") return null;
              const submenu = submenus?.[entry.id];

              if (submenu) {
                return (
                  <ContextMenuSub key={entry.id}>
                    <ContextMenuSubTrigger className="text-[13px]">
                      {entry.label}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent className="max-h-72 w-52 overflow-y-auto">
                      {submenu.options.map((option) => (
                        <ContextMenuItem
                          key={String(option.value)}
                          className="gap-2 text-[13px]"
                          onSelect={() => submenu.onPick(option)}
                        >
                          {option.icon}
                          <span className="truncate">{option.label}</span>
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                );
              }

              return (
                <ContextMenuItem
                  key={entry.id}
                  className={cn(
                    "text-[13px]",
                    entry.destructive && "text-destructive",
                  )}
                  onSelect={() => onSelect(entry.id)}
                >
                  {entry.label}
                </ContextMenuItem>
              );
            })}
          </div>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
