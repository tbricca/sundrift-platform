/**
 * Publishes what the user is looking at (read by `view-screen`) and consumes
 * one-shot `navigate` commands from the agent.
 *
 * View configuration is reported as the preset plus the URL overrides, which
 * is exactly how the app itself reconstructs the query — the agent never has
 * to guess at hidden state.
 */
import { useAgentRouteState } from "@agent-native/core/client/route-state";

import { readAnalyticsContext } from "@/lib/agent-analytics-context";
import { readCycleContext } from "@/lib/agent-cycle-context";
import { readInboxContext } from "@/lib/agent-inbox-context";
import { readProjectContext } from "@/lib/agent-project-context";
import { readSearchContext } from "@/lib/agent-search-context";
import { readSelectionContext } from "@/lib/agent-selection-context";
import { readTriageContext } from "@/lib/agent-triage-context";
import { OVERLAY_PARAM } from "@/lib/view-url";

type NavigateCommand = {
  view?: string;
  path?: string;
  threadId?: string;
  teamKey?: string;
  issueIdentifier?: string;
  projectId?: string;
  cycleId?: string;
  viewId?: string;
};

const VIEW_PARAM_KEYS = [
  "layout",
  "group",
  "sort",
  "q",
  "team",
  "status",
  "status!",
  "category",
  "category!",
  "assignee",
  "assignee!",
  "priority",
  "priority!",
  "project",
  "project!",
  "cycle",
  "cycle!",
  "milestone",
  "milestone!",
  "label",
  "label!",
  "creator",
  "creator!",
  "due",
  "dueBefore",
  "dueAfter",
  "createdBefore",
  "createdAfter",
  "updatedBefore",
  "updatedAfter",
  "archived",
  "cols",
];

function issueViewState(searchParams: URLSearchParams) {
  const overrides: Record<string, string> = {};
  for (const key of VIEW_PARAM_KEYS) {
    const value = searchParams.get(key);
    if (value !== null) overrides[key] = value;
  }
  return {
    layout: searchParams.get("layout") ?? "list (preset default)",
    grouping: searchParams.get("group") ?? "preset default",
    ordering: searchParams.get("sort") ?? "preset default",
    search: searchParams.get("q") ?? null,
    includesArchived: searchParams.get("archived") === "1",
    visibleColumns: searchParams.get("cols")?.split(",") ?? "preset default",
    filterOverrides: overrides,
  };
}

export function useAgentNavigation() {
  useAgentRouteState<Record<string, unknown>, NavigateCommand>({
    getNavigationState: ({ pathname, searchParams }) => {
      const openIssue = searchParams.get(OVERLAY_PARAM);
      const base: Record<string, unknown> = { path: pathname };
      if (openIssue) base.openIssue = openIssue;

      const selection = readSelectionContext();
      if (selection) base.selection = selection;

      // Search floats above whatever route is behind it, so it is reported
      // alongside the view rather than replacing it.
      const search = readSearchContext();
      if (search) {
        base.globalSearch = {
          query: search.query,
          focusedResult: search.focusedResult,
          counts: search.counts,
        };
      }

      const team = /^\/team\/([^/]+)\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
      if (team) {
        const [, teamKey, section, child] = team;
        base.teamKey = teamKey.toUpperCase();
        base.view = `team-${section}`;

        if (section === "cycles" && child) {
          base.view = "cycle";
          base.cycleId = child;
          const cycle = readCycleContext(child);
          if (cycle) {
            base.cycle = {
              number: cycle.number,
              name: cycle.name,
              state: cycle.state,
              startsAt: cycle.startsAt,
              endsAt: cycle.endsAt,
              progress: cycle.progress,
            };
          }
          base.issueView = {
            preset: `cycleQuery(${child})`,
            ...issueViewState(searchParams),
          };
          return base;
        }

        if (section === "analytics") {
          base.view = "team-analytics";
          const analytics = readAnalyticsContext(teamKey.toUpperCase());
          if (analytics) base.analytics = analytics;
          return base;
        }

        if (section === "triage") {
          base.view = "team-triage";
          const triage = readTriageContext();
          if (triage) {
            base.triage = {
              scope: triage.scope,
              pendingCount: triage.pendingCount,
              focusedIssue: triage.focusedIssue,
            };
          }
          base.issueView = {
            preset: `triageQuery(${teamKey.toUpperCase()})`,
            ...issueViewState(searchParams),
          };
          return base;
        }

        if (section === "issues" || section === "backlog") {
          base.issueView = {
            preset: section === "backlog" ? "backlogQuery" : "teamIssuesQuery",
            ...issueViewState(searchParams),
          };
        }
        return base;
      }

      const savedView = /^\/views\/([^/]+)/.exec(pathname);
      if (savedView) {
        base.view = "saved-view";
        base.savedViewId = savedView[1];
        base.issueView = {
          preset: "saved-view",
          ...issueViewState(searchParams),
        };
        return base;
      }

      if (pathname === "/my-issues") {
        base.view = "my-issues";
        base.issueView = {
          preset: "myIssuesQuery",
          ...issueViewState(searchParams),
        };
        return base;
      }

      if (pathname === "/inbox") {
        base.view = "inbox";
        const inbox = readInboxContext();
        if (inbox) {
          base.inbox = {
            filter: inbox.filter,
            unreadCount: inbox.unreadCount,
            focusedNotificationId: inbox.focusedId,
          };
        }
        return base;
      }

      if (pathname === "/favorites") {
        base.view = "favorites";
        return base;
      }

      const issue = /^\/issue\/([^/]+)/.exec(pathname);
      if (issue) {
        base.view = "issue";
        base.issueIdentifier = issue[1];
        return base;
      }

      const project = /^\/projects\/([^/]+)(?:\/([^/]+))?/.exec(pathname);
      if (project) {
        const [, projectId, section] = project;
        const tab = section ?? "overview";
        base.view = `project-${tab}`;
        base.projectId = projectId;
        base.projectTab = tab;
        const detail = readProjectContext(projectId);
        if (detail) {
          base.project = {
            name: detail.name,
            status: detail.status,
            health: detail.health,
            lead: detail.lead,
            startDate: detail.startDate,
            targetDate: detail.targetDate,
            progress: detail.progress,
            milestones: detail.milestones.map((m) => m.name),
          };
        }
        if (tab === "issues") {
          const milestoneId = searchParams.get("milestone");
          base.issueView = {
            preset: `projectQuery(${projectId})`,
            ...issueViewState(searchParams),
          };
          if (milestoneId) {
            base.selectedMilestone =
              detail?.milestones.find((m) => m.id === milestoneId)?.name ??
              milestoneId;
          }
        }
        return base;
      }

      base.view = pathname === "/" ? "chat" : pathname.slice(1);
      return base;
    },

    getCommandPath: (command) => {
      if (command.path) return command.path;
      const teamKey = command.teamKey?.toUpperCase();
      switch (command.view) {
        case "chat":
          return command.threadId ? `/chat/${command.threadId}` : "/";
        case "issue":
          return command.issueIdentifier
            ? `/issue/${command.issueIdentifier}`
            : null;
        case "team-issues":
          return teamKey ? `/team/${teamKey}/issues` : null;
        case "team-backlog":
          return teamKey ? `/team/${teamKey}/backlog` : null;
        case "team-cycles":
          return teamKey ? `/team/${teamKey}/cycles` : null;
        case "team-triage":
          return teamKey ? `/team/${teamKey}/triage` : null;
        case "cycle":
          return teamKey && command.cycleId
            ? `/team/${teamKey}/cycles/${command.cycleId}`
            : null;
        case "team-projects":
          return teamKey ? `/team/${teamKey}/projects` : null;
        case "team-views":
          return teamKey ? `/team/${teamKey}/views` : null;
        case "saved-view":
          return command.viewId ? `/views/${command.viewId}` : "/views";
        case "project":
          return command.projectId
            ? `/projects/${command.projectId}`
            : "/projects";
        case "project-issues":
          return command.projectId
            ? `/projects/${command.projectId}/issues`
            : null;
        case "project-updates":
          return command.projectId
            ? `/projects/${command.projectId}/updates`
            : null;
        case "my-issues":
          return "/my-issues";
        case "inbox":
        case "favorites":
        case "projects":
        case "views":
        case "settings":
          return `/${command.view}`;
        default:
          return null;
      }
    },
  });
}
