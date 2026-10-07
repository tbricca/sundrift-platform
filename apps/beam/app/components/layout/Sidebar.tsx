import {
  navigateWithAgentChatViewTransition,
  useChatThreads,
  type ChatThreadSummary,
} from "@agent-native/core/client/agent-chat";
import { useT } from "@agent-native/core/client/i18n";
import { OrgSwitcher } from "@agent-native/core/client/org";
import { FeedbackButton } from "@agent-native/core/client/ui";
import { SidebarFooterActions } from "@agent-native/toolkit/app-shell";
import {
  ChatHistoryRail,
  type ChatHistoryItem,
} from "@agent-native/toolkit/chat-history";
import {
  IconBox,
  IconChevronRight,
  IconCommand,
  IconInbox,
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMessageCircle,
  IconPencilPlus,
  IconSearch,
  IconSettings,
  IconStack2,
  IconStar,
  IconUser,
} from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { toast } from "sonner";

import { openCommandPalette } from "@/components/command/CommandPalette";
import { openCreateIssue } from "@/components/issues/CreateIssueDialog";
import { openGlobalSearch } from "@/components/search/GlobalSearch";
import { SidebarFavorites } from "@/components/layout/SidebarFavorites";
import { KeyHint } from "@/components/ui/keycap";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useUnreadCount } from "@/hooks/use-notifications";
import { useWorkspace } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type NavItem = {
  icon: typeof IconInbox;
  label: string;
  href: string;
  /** Renders a Linear-style group heading above this row. */
  section?: string;
};

const workspaceNavItems: NavItem[] = [
  { icon: IconInbox, label: "Inbox", href: "/inbox" },
  { icon: IconUser, label: "My Issues", href: "/my-issues" },
  { icon: IconStar, label: "Favorites", href: "/favorites" },
  { icon: IconBox, label: "Projects", href: "/projects", section: "Workspace" },
  { icon: IconStack2, label: "Views", href: "/views" },
];

const teamSubItems = [
  { label: "Issues", segment: "issues" },
  { label: "Triage", segment: "triage" },
  { label: "Backlog", segment: "backlog" },
  { label: "Cycles", segment: "cycles" },
  { label: "Projects", segment: "projects" },
  { label: "Views", segment: "views" },
  { label: "Analytics", segment: "analytics" },
  { label: "Templates", segment: "templates" },
];

const CHAT_STORAGE_KEY = "chat";
const CHAT_ACTIVE_THREAD_KEY = `agent-chat-active-thread:${CHAT_STORAGE_KEY}`;
const TEAMS_EXPANDED_KEY = "beam.sidebar.teams";

interface SidebarProps {
  collapsed?: boolean;
  collapsible?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function formatThreadAge(updatedAt: number) {
  const diffMs = Math.max(0, Date.now() - updatedAt);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(updatedAt).toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
}

function threadTitle(thread: ChatThreadSummary) {
  return thread.title || thread.preview || "Untitled chat";
}

function threadUpdatedAt(thread: ChatThreadSummary) {
  return Number.isFinite(thread.updatedAt)
    ? thread.updatedAt
    : Number.isFinite(thread.createdAt)
      ? thread.createdAt
      : 0;
}

function compareThreads(a: ChatThreadSummary, b: ChatThreadSummary) {
  const aPinned = a.pinnedAt ?? 0;
  const bPinned = b.pinnedAt ?? 0;
  if (aPinned || bPinned) return bPinned - aPinned;
  return threadUpdatedAt(b) - threadUpdatedAt(a);
}

function persistedActiveThreadId() {
  try {
    return localStorage.getItem(CHAT_ACTIVE_THREAD_KEY);
  } catch {
    return null;
  }
}

function persistActiveThreadId(threadId: string) {
  try {
    localStorage.setItem(CHAT_ACTIVE_THREAD_KEY, threadId);
  } catch {}
}

function threadIdFromPath(pathname: string) {
  const match = pathname.match(/^\/chat\/([^/]+)/);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim();
    return value || null;
  } catch {
    return null;
  }
}

function chatThreadPath(threadId: string) {
  return `/chat/${encodeURIComponent(threadId)}`;
}

function ChatThreadsSection({ open }: { open: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();
  const t = useT();
  const {
    threads,
    activeThreadId,
    createThread,
    switchThread,
    pinThread,
    archiveThread,
    renameThread,
    refreshThreads,
  } = useChatThreads(undefined, CHAT_STORAGE_KEY, undefined, {
    autoCreate: false,
    restoreActiveThread: false,
  });

  const visibleThreads = useMemo(
    () =>
      threads
        .filter((thread) => thread.messageCount > 0 && !thread.archivedAt)
        .sort(compareThreads)
        .slice(0, 15),
    [threads],
  );
  const displayedActiveThreadId =
    threadIdFromPath(location.pathname) ??
    (location.pathname === "/" ? null : activeThreadId);
  const chatItems = useMemo<ChatHistoryItem[]>(
    () =>
      visibleThreads.map((thread) => ({
        id: thread.id,
        title: threadTitle(thread),
        titleText: threadTitle(thread),
        timestamp:
          thread.id === displayedActiveThreadId
            ? undefined
            : formatThreadAge(threadUpdatedAt(thread)),
        pinned: Boolean(thread.pinnedAt),
      })),
    [displayedActiveThreadId, visibleThreads],
  );

  useEffect(() => {
    const refresh = () => refreshThreads();
    const handleRunning = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { isRunning?: unknown }
        | undefined;
      if (typeof detail?.isRunning === "boolean") refreshThreads();
    };

    window.addEventListener("agent-chat:threads-updated", refresh);
    window.addEventListener("agentNative.chatRunning", handleRunning);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("agent-chat:threads-updated", refresh);
      window.removeEventListener("agentNative.chatRunning", handleRunning);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshThreads]);

  function openThread(threadId: string, options?: { isNew?: boolean }) {
    switchThread(threadId);
    persistActiveThreadId(threadId);
    navigateWithAgentChatViewTransition(
      navigate,
      options?.isNew ? "/" : chatThreadPath(threadId),
    );
    window.requestAnimationFrame(() => {
      window.dispatchEvent(
        new CustomEvent("agent-chat:open-thread", {
          detail: { threadId, newThread: options?.isNew === true },
        }),
      );
    });
  }

  async function handleNewChat() {
    const threadId = await createThread();
    if (threadId) openThread(threadId, { isNew: true });
  }

  async function handleArchiveThread(threadId: string) {
    const wasActive =
      threadId === activeThreadId || threadId === persistedActiveThreadId();
    const archived = await archiveThread(threadId);
    if (!archived) {
      toast.error(t("chat.archiveFailed"));
      return;
    }
    if (wasActive) {
      await handleNewChat();
    }
  }

  function handleRenameThread(threadId: string, title: string) {
    void renameThread(threadId, title).then((renamed) => {
      if (!renamed) toast.error(t("chat.renameFailed"));
    });
  }

  return (
    <div
      className="an-chat-history-rail__collapse"
      data-state={open ? "open" : "closed"}
      aria-hidden={!open}
    >
      <div className="ms-4">
        <ChatHistoryRail
          items={chatItems}
          activeId={displayedActiveThreadId}
          onSelect={(threadId) => openThread(threadId)}
          onNewChat={() => void handleNewChat()}
          railLabels={{
            newChat: t("chat.newChat"),
            showMore: t("chat.chats"),
            showLess: t("chat.chats"),
          }}
          renameMaxLength={160}
          onTogglePin={(threadId) => {
            const thread = visibleThreads.find((item) => item.id === threadId);
            if (thread) void pinThread(threadId, !thread.pinnedAt);
          }}
          onRename={handleRenameThread}
          onDelete={(threadId) => void handleArchiveThread(threadId)}
          labels={{
            options: (item) =>
              t("chat.optionsFor", { title: item.titleText ?? "" }),
            renameInput: (item) =>
              t("chat.renameThread", { title: item.titleText ?? "" }),
            rename: t("chat.renameChat"),
            pin: t("chat.pinChat"),
            unpin: t("chat.unpinChat"),
            delete: t("chat.archiveChat"),
          }}
          className="min-w-0"
        />
      </div>
    </div>
  );
}

/**
 * Two strokes leaning forward: a solid wedge and a lighter slash beside it.
 *
 * No tile behind it. The mark sits directly on the sidebar, so the wedge takes
 * the sidebar's own foreground colour and inverts with the theme, while the
 * accent stroke stays a fixed cyan in both.
 */
function BeamMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <path
        d="M22 6h18L26 58H8z"
        fill="hsl(var(--sidebar-accent-foreground))"
      />
      <path d="M46 6h12L44 58H32z" fill="#22c1e8" />
    </svg>
  );
}

function readExpandedTeams(): string[] {
  try {
    const raw = localStorage.getItem(TEAMS_EXPANDED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function TeamsSection() {
  const location = useLocation();
  const { workspace } = useWorkspace();
  const [expanded, setExpanded] = useState<string[]>([]);

  useEffect(() => {
    setExpanded(readExpandedTeams());
  }, []);

  const routeTeamKey = location.pathname.match(/^\/team\/([^/]+)/)?.[1];

  function toggle(teamKey: string) {
    setExpanded((current) => {
      const next = current.includes(teamKey)
        ? current.filter((entry) => entry !== teamKey)
        : [...current, teamKey];
      try {
        localStorage.setItem(TEAMS_EXPANDED_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  const teams = workspace?.teams ?? [];
  if (teams.length === 0) return null;

  return (
    <div className="mt-4">
      <p className="px-3 pb-1 pt-1 text-[12px] font-medium text-sidebar-foreground/55">
        Your teams
      </p>
      {teams.map((team) => {
        const teamKey = team.key.toUpperCase();
        const isOpen =
          expanded.includes(teamKey) || routeTeamKey?.toUpperCase() === teamKey;
        return (
          <div key={team.id}>
            <button
              type="button"
              onClick={() => toggle(teamKey)}
              aria-expanded={isOpen}
              className="flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-3 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground"
            >
              <IconChevronRight
                className={cn(
                  "size-3.5 shrink-0 transition-transform",
                  isOpen && "rotate-90",
                )}
              />
              <span
                className="size-2.5 shrink-0 rounded-[3px]"
                style={{ backgroundColor: team.color ?? "#8b8f9c" }}
              />
              <span className="truncate font-medium">{team.name}</span>
              <span className="ms-auto text-[11px] font-medium text-sidebar-foreground/50">
                {teamKey}
              </span>
            </button>
            {isOpen ? (
              <div className="ms-[26px] border-s border-sidebar-border ps-2">
                {teamSubItems.map((item) => {
                  const href = `/team/${teamKey}/${item.segment}`;
                  const active = location.pathname === href;
                  const pending =
                    item.segment === "triage" && team.triageEnabled
                      ? team.pendingTriageCount
                      : 0;
                  return (
                    <Link
                      key={item.segment}
                      to={href}
                      className={cn(
                        "flex h-7 items-center rounded-md px-2 text-[13px] transition-colors",
                        active
                          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                          : "text-sidebar-foreground/85 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                      )}
                    >
                      {item.label}
                      {pending > 0 ? (
                        <span className="beam-meta ms-auto text-primary">
                          {pending}
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function Sidebar({
  collapsed = false,
  collapsible = true,
  onCollapsedChange,
}: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const unreadCount = useUnreadCount();
  const isChatRoute =
    location.pathname === "/" || location.pathname.startsWith("/chat/");
  const ToggleIcon = collapsed
    ? IconLayoutSidebarLeftExpand
    : IconLayoutSidebarLeftCollapse;

  const navClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "flex items-center text-[13px] transition-colors",
      collapsed
        ? "relative h-10 w-full justify-center rounded-none px-0"
        : "h-8 gap-2.5 rounded-md px-3",
      isActive
        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
        : "text-sidebar-foreground hover:bg-sidebar-accent/65 hover:text-sidebar-accent-foreground",
    );

  const collapseButton = collapsible ? (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => onCollapsedChange?.(!collapsed)}
          className={cn(
            "flex shrink-0 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "size-8" : "size-7",
          )}
          aria-label={
            collapsed
              ? t("navigation.expandSidebar")
              : t("navigation.collapseSidebar")
          }
        >
          <ToggleIcon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        {collapsed
          ? t("navigation.expandSidebar")
          : t("navigation.collapseSidebar")}
      </TooltipContent>
    </Tooltip>
  ) : null;

  const searchButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => openGlobalSearch()}
          aria-label="Search workspace"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <IconSearch className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right" className="flex items-center gap-1.5">
        Search workspace
        <KeyHint token={shortcutKeys("app.search")} />
      </TooltipContent>
    </Tooltip>
  );

  const feedbackButton = (
    <FeedbackButton
      variant={collapsed ? "icon" : "sidebar"}
      side="right"
      className={collapsed ? "h-8 w-8" : "min-w-0"}
    />
  );

  return (
    <aside
      data-collapsed={collapsed ? "true" : "false"}
      className={cn(
        "flex h-full min-w-0 shrink-0 flex-col overflow-hidden border-e border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out",
        collapsed ? "w-12" : "w-[248px]",
      )}
    >
      <div
        className={cn(
          "flex shrink-0 items-center",
          collapsed ? "h-12 justify-center px-0" : "h-14 px-3",
        )}
      >
        <Link
          to="/"
          onClick={(event) => {
            if (
              !collapsible ||
              !onCollapsedChange ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey ||
              event.button !== 0
            ) {
              return;
            }
            event.preventDefault();
            onCollapsedChange(!collapsed);
          }}
          className={cn(
            "flex min-w-0 items-center rounded outline-none focus-visible:ring-2 focus-visible:ring-ring",
            collapsed ? "size-7 justify-center" : "flex-1 gap-2",
          )}
          aria-label={
            collapsible && onCollapsedChange
              ? collapsed
                ? t("navigation.expandSidebar")
                : t("navigation.collapseSidebar")
              : APP_TITLE
          }
        >
          <BeamMark className="size-5 shrink-0" />
          <span
            className={cn(
              "truncate text-[15px] font-bold tracking-[-0.01em] text-sidebar-accent-foreground",
              collapsed && "sr-only",
            )}
          >
            {APP_TITLE}
          </span>
        </Link>

        {collapsed ? null : (
          <div className="flex shrink-0 items-center gap-0.5">
            {searchButton}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openCommandPalette()}
                  aria-label="Command palette"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/65 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconCommand className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-1.5">
                Command palette
                <KeyHint token={shortcutKeys("app.palette")} />
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => openCreateIssue()}
                  aria-label="Create issue"
                  className="flex size-8 cursor-pointer items-center justify-center rounded-full border border-sidebar-border bg-card text-sidebar-accent-foreground shadow-[0_1px_2px_rgba(16,18,32,0.06)] transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <IconPencilPlus className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-1.5">
                Create issue
                <KeyHint token={shortcutKeys("issue.create")} />
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <div className={cn("shrink-0", collapsed ? "px-1 pb-2" : "hidden")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => openCreateIssue()}
                aria-label="Create issue"
                className="flex size-10 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <IconPencilPlus className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-1.5">
              Create issue
              <KeyHint token={shortcutKeys("issue.create")} />
            </TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <nav
        className={cn(
          "min-h-0 flex-1 overflow-y-auto",
          collapsed ? "px-0 py-1" : "px-2 pb-3",
        )}
      >
        <div className="grid gap-0.5">
          {workspaceNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname.startsWith(item.href);
            const unread = item.href === "/inbox" ? unreadCount : 0;
            const link = (
              <Link
                to={item.href}
                className={navClass({ isActive })}
                aria-current={isActive ? "page" : undefined}
                aria-label={
                  collapsed
                    ? unread
                      ? `${item.label}, ${unread} unread`
                      : item.label
                    : undefined
                }
              >
                <Icon className="size-4 shrink-0" />
                <span className={collapsed ? "sr-only" : "truncate"}>
                  {item.label}
                </span>
                {unread > 0 ? (
                  collapsed ? (
                    <span
                      aria-hidden
                      className="absolute end-2 top-2 size-1.5 rounded-full bg-primary"
                    />
                  ) : (
                    <span className="beam-meta ms-auto text-primary">
                      {unread}
                    </span>
                  )
                ) : null}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {unread ? `${item.label} · ${unread} unread` : item.label}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>
                {item.section ? (
                  <p className="px-3 pb-1 pt-4 text-[12px] font-medium text-sidebar-foreground/55">
                    {item.section}
                  </p>
                ) : null}
                {link}
              </div>
            );
          })}
        </div>

        {collapsed ? null : <SidebarFavorites />}
        {collapsed ? null : <TeamsSection />}

        <div className={cn("mt-4 grid gap-0.5", collapsed && "mt-1")}>
          {(() => {
            const link = (
              <Link
                to="/"
                onClick={(event) => {
                  if (
                    !isChatRoute &&
                    !event.metaKey &&
                    !event.ctrlKey &&
                    !event.shiftKey &&
                    !event.altKey
                  ) {
                    event.preventDefault();
                    navigateWithAgentChatViewTransition(navigate, "/");
                  }
                }}
                className={navClass({ isActive: isChatRoute })}
                aria-current={isChatRoute ? "page" : undefined}
                aria-label={collapsed ? t("navigation.chat") : undefined}
              >
                <IconMessageCircle className="size-4 shrink-0" />
                <span className={collapsed ? "sr-only" : "truncate"}>
                  {t("navigation.chat")}
                </span>
              </Link>
            );
            return collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {t("navigation.chat")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div>
                {link}
                <ChatThreadsSection open={isChatRoute} />
              </div>
            );
          })()}
        </div>
      </nav>

      <div className={cn("mt-auto shrink-0", collapsed && "py-2")}>
        <nav
          className={cn(
            "grid",
            collapsed ? "gap-0 px-1 py-1" : "gap-1 px-2 py-1",
          )}
        >
          {(() => {
            const isActive = location.pathname.startsWith("/settings");
            const link = (
              <Link
                to="/settings"
                className={navClass({ isActive })}
                aria-current={isActive ? "page" : undefined}
                aria-label={collapsed ? t("navigation.settings") : undefined}
              >
                <IconSettings className="size-4 shrink-0" />
                <span className={collapsed ? "sr-only" : "truncate"}>
                  {t("navigation.settings")}
                </span>
              </Link>
            );
            return collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">
                  {t("navigation.settings")}
                </TooltipContent>
              </Tooltip>
            ) : (
              <div>{link}</div>
            );
          })()}
        </nav>

        <div className={cn(collapsed ? "px-1 py-1" : "px-3 py-2")}>
          <OrgSwitcher
            reserveSpace
            className={
              collapsed
                ? "h-8 justify-center px-0 [&>span]:sr-only [&>svg:last-child]:hidden"
                : undefined
            }
          />
        </div>

        <SidebarFooterActions
          collapsed={collapsed}
          feedback={feedbackButton}
          collapse={collapseButton}
        />
      </div>
    </aside>
  );
}
