import { OrgSwitcher } from "@agent-native/toolkit/app/org";
import { AgentNativeIcon } from "@agent-native/toolkit/app/shared/AgentNativeIcon";
import {
  IconChartBar,
  IconMessage,
  IconSettings,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router";

import { APP_TITLE } from "@/lib/app-config";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed?: boolean;
  collapsible?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

const LINKS = [
  { to: "/dispatch", label: "Switch apps", icon: IconChartBar, match: () => false },
  { to: "/campaigns", label: "Campaigns", icon: IconChartBar, match: (path: string) => path.startsWith("/campaign") || path.startsWith("/new-campaign") },
  { to: "/home", label: "Agent", icon: IconMessage, match: (path: string) => path === "/home" || path.startsWith("/chat/") },
  { to: "/settings", label: "Settings", icon: IconSettings, match: (path: string) => path.startsWith("/settings") },
];

export function Sidebar({ collapsed = false }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground",
        collapsed ? "w-12" : "w-full",
      )}
    >
      <div className={cn("flex h-14 shrink-0 items-center", collapsed ? "justify-center" : "px-3")}>
        <Link to="/campaigns" className="flex min-w-0 items-center gap-2" aria-label={APP_TITLE}>
          <AgentNativeIcon aria-hidden="true" className="h-3.5 w-6 shrink-0" />
          {collapsed ? null : (
            <span className="truncate text-sm font-semibold">{APP_TITLE}</span>
          )}
        </Link>
      </div>
      <nav aria-label="Campaign Planner" className="flex min-h-0 flex-1 flex-col gap-1 px-2 py-2">
        {LINKS.map((item) => {
          const Icon = item.icon;
          const active = item.match(location.pathname);
          return (
            <Link
              key={item.label}
              to={item.to}
              title={item.label}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent",
                collapsed && "justify-center px-0",
              )}
            >
              <Icon className="size-4 shrink-0" strokeWidth={1.8} />
              {collapsed ? null : <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-2">
        <OrgSwitcher
          reserveSpace
          compact={collapsed}
          currentAppId="campaign-planner"
        />
      </div>
    </aside>
  );
}
