import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  threadId?: string;
  researchId?: string;
  requestId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname, searchParams }) => {
      const threadId = threadIdFromPath(pathname);
      const researchId = researchIdFromPath(pathname);
      const requestId = searchParams?.get("requestId") ?? undefined;
      return {
        view: viewForPath(pathname),
        path: appPath(pathname),
        ...(threadId ? { threadId } : {}),
        ...(researchId ? { researchId } : {}),
        ...(requestId ? { requestId } : {}),
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

function researchIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/reports\/([^/]+)/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function viewForPath(pathname: string): string {
  if (pathname.startsWith("/reports/")) return "report";
  if (pathname.startsWith("/research")) return "research";
  if (pathname.startsWith("/audit-log")) return "audit-log";
  if (pathname === "/home" || pathname.startsWith("/chat/")) return "chat";
  if (pathname.startsWith("/settings/agent") || pathname.startsWith("/agent")) {
    return "agent";
  }
  if (pathname.startsWith("/settings")) return "settings";
  return "research";
}

function pathForView(view?: string): string {
  switch (view) {
    case "report":
      return "/research";
    case "research":
      return "/research";
    case "audit-log":
      return "/audit-log";
    case "chat":
    case "home":
    case "ask":
      return "/home";
    case "agent":
      return "/settings/agent";
    case "settings":
      return "/settings";
    default:
      return "/research";
  }
}

function pathForCommand(command: {
  view?: string;
  threadId?: string;
  researchId?: string;
  requestId?: string;
}): string {
  if (command.view === "report" && command.researchId) {
    return `/reports/${encodeURIComponent(command.researchId)}`;
  }
  if (command.view === "audit-log") {
    return command.requestId
      ? `/audit-log?requestId=${encodeURIComponent(command.requestId)}`
      : "/audit-log";
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
