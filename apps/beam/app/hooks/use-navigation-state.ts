import { appBasePath, appPath } from "@agent-native/core/client/api-path";
import { useAgentRouteState } from "@agent-native/core/client/navigation";

import { TAB_ID } from "@/lib/tab-id";

export interface NavigationState {
  view: string;
  path?: string;
  threadId?: string;
  teamKey?: string;
  issueIdentifier?: string;
  projectId?: string;
}

export function useNavigationState() {
  useAgentRouteState<NavigationState>({
    browserTabId: TAB_ID,
    requestSource: TAB_ID,
    getNavigationState: ({ pathname }) => {
      const threadId = threadIdFromPath(pathname);
      const teamKey = pathname.match(/^\/team\/([^/]+)/)?.[1];
      const issueIdentifier = pathname.match(/^\/issue\/([^/]+)/)?.[1];
      const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
      return {
        view: viewForPath(pathname),
        path: appPath(pathname),
        ...(threadId ? { threadId } : {}),
        ...(teamKey ? { teamKey: teamKey.toUpperCase() } : {}),
        ...(issueIdentifier
          ? { issueIdentifier: decodeURIComponent(issueIdentifier) }
          : {}),
        ...(projectId ? { projectId } : {}),
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

function viewForPath(pathname: string): string {
  if (isChatPath(pathname)) return "chat";
  if (pathname.startsWith("/issue/")) return "issue";
  if (pathname.startsWith("/team/")) {
    const segment = pathname.split("/")[3] ?? "issues";
    return `team-${segment}`;
  }
  if (pathname.startsWith("/inbox")) return "inbox";
  if (pathname.startsWith("/my-issues")) return "my-issues";
  if (pathname.startsWith("/favorites")) return "favorites";
  if (pathname.startsWith("/projects")) return "projects";
  if (pathname.startsWith("/views")) return "views";
  if (pathname.startsWith("/database")) return "database";
  if (pathname.startsWith("/observability")) return "observability";
  if (pathname.startsWith("/agent")) return "agent";
  if (pathname.startsWith("/settings")) return "settings";
  return "chat";
}

function pathForView(view?: string, command?: any): string {
  const teamKey = String(command?.teamKey ?? "").toUpperCase();
  switch (view) {
    case "chat":
    case "home":
    case "ask":
      return "/";
    case "issue":
      return command?.issueIdentifier
        ? `/issue/${encodeURIComponent(String(command.issueIdentifier))}`
        : "/";
    case "team-issues":
    case "team":
      return teamKey ? `/team/${teamKey}/issues` : "/";
    case "team-backlog":
      return teamKey ? `/team/${teamKey}/backlog` : "/";
    case "team-cycles":
      return teamKey ? `/team/${teamKey}/cycles` : "/";
    case "team-projects":
      return teamKey ? `/team/${teamKey}/projects` : "/";
    case "team-views":
      return teamKey ? `/team/${teamKey}/views` : "/";
    case "inbox":
      return "/inbox";
    case "my-issues":
      return "/my-issues";
    case "favorites":
      return "/favorites";
    case "projects":
      return command?.projectId
        ? `/projects/${encodeURIComponent(String(command.projectId))}`
        : "/projects";
    case "views":
      return "/views";
    case "database":
      return "/database";
    case "observability":
      return "/observability";
    case "agent":
      return "/agent";
    case "settings":
      return "/settings";
    default:
      return "/";
  }
}

function pathForCommand(command: any): string {
  const path = pathForView(command?.view, command);
  if (path !== "/") return path;
  const threadId =
    typeof command?.threadId === "string" ? command.threadId.trim() : "";
  return threadId ? `/chat/${encodeURIComponent(threadId)}` : "/";
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

function isChatPath(pathname: string): boolean {
  return pathname === "/" || pathname.startsWith("/chat/");
}
