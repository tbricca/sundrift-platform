import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  threadId?: string;
  campaignId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => {
      const threadId = threadIdFromPath(pathname);
      const campaignId = campaignIdFromPath(pathname);
      return {
        view: viewForPath(pathname),
        path: appPath(pathname),
        ...(threadId ? { threadId } : {}),
        ...(campaignId ? { campaignId } : {}),
      };
    },
    getCommandPath: (command) =>
      routerPath(command.path || pathForCommand(command)),
  });
}

function threadIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/chat\/([^/]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function campaignIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/campaign\/([^/]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function viewForPath(pathname: string): string {
  if (pathname.startsWith("/campaign/")) return "campaign";
  if (pathname.startsWith("/campaigns")) return "campaigns";
  if (pathname === "/home" || pathname.startsWith("/chat/")) return "chat";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  return "campaigns";
}

function pathForView(view?: string): string {
  switch (view) {
    case "campaign":
    case "campaigns":
      return "/campaigns";
    case "chat":
    case "home":
    case "ask":
      return "/home";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/settings";
    default:
      return "/campaigns";
  }
}

function pathForCommand(command: {
  view?: string;
  threadId?: string;
  campaignId?: string;
}): string {
  if (command.view === "campaign" && command.campaignId) {
    return `/campaign/${encodeURIComponent(command.campaignId)}`;
  }
  const path = pathForView(command.view);
  if (path !== "/home") return path;
  const threadId = command.threadId?.trim() ?? "";
  return threadId ? `/chat/${encodeURIComponent(threadId)}` : path;
}

function routerPath(path: string): string {
  const basePath = appBasePath();
  if (!basePath) return path;
  if (path === basePath) return "/";
  if (path.startsWith(`${basePath}/`)) {
    return path.slice(basePath.length) || "/";
  }
  return path;
}
