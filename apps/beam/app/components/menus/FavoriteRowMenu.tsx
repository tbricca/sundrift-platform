/**
 * Right-click menu for a Favorites row, on the page and in the sidebar.
 *
 * Deliberately two items. A favorite is a shortcut to somewhere else, so the
 * useful actions are "go there" and "stop pinning it"; the entity's own menu
 * lives where the entity does.
 */
import type { ReactNode } from "react";
import { useNavigate } from "react-router";

import { favoriteMenuModel } from "@/components/command/command-menu";
import type { FavoriteEntityType } from "@/hooks/use-favorites";

import { EntityContextMenu } from "./EntityContextMenu";

export function FavoriteRowMenu({
  href,
  label,
  onRemove,
  children,
}: {
  href: string;
  label: string;
  entityType?: FavoriteEntityType;
  onRemove: () => void | Promise<void>;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <EntityContextMenu
      sections={favoriteMenuModel()}
      header={label}
      onSelect={(id) => {
        if (id === "open") navigate(href);
        if (id === "unfavorite") void onRemove();
      }}
    >
      {children}
    </EntityContextMenu>
  );
}
