/**
 * Global search: "what do you want Beam to find?"
 *
 * Its sibling, the command palette, answers "what do you want Beam to do?" —
 * the two stay separate on purpose, and so do their keys (`/` versus Mod+K).
 *
 * Results come from `search-workspace`, already ranked, so cmdk's own filter
 * is switched off and the server order is what the user sees. cmdk supplies
 * Up/Down/Enter inside the dialog, which is why this file registers no key
 * listener beyond `/` to open and Escape to close.
 */
import {
  IconCalendarRepeat,
  IconFolder,
  IconLayoutColumns,
  IconSearch,
} from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import { useIssueOverlay } from "@/components/issues/IssueOverlay";
import {
  MemberAvatar,
  StatusIcon,
  formatShortDate,
} from "@/components/issues/primitives";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { KeyHint } from "@/components/ui/keycap";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import { useWorkspaceSearch } from "@/hooks/use-workspace-search";
import { publishSearchContext } from "@/lib/agent-search-context";
import { cycleTitle } from "@/lib/cycle";
import {
  rememberRecent,
  recentItems,
  type RecentItem,
} from "@/lib/search-recents";
import {
  publishSearchScope,
  readSessionQuery,
  writeSessionQuery,
  type SearchScope,
} from "@/lib/search-session";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import type { WorkspaceSearchResults } from "@/lib/types";
import { cn } from "@/lib/utils";

const OPEN_EVENT = "beam:global-search";

/** Opening a result: where to go, whether the overlay will do, and its scope. */
type SelectResult = (
  item: RecentItem,
  useOverlay?: boolean,
  scope?: SearchScope | null,
) => void;

export function openGlobalSearch() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

/** Routes that render an issue list or board, where the overlay is the nicer
 * way to open a result without losing the view behind it. */
function hostsIssueView(pathname: string): boolean {
  return (
    /^\/team\/[^/]+\/(issues|backlog|triage)$/.test(pathname) ||
    /^\/team\/[^/]+\/cycles\/[^/]+$/.test(pathname) ||
    /^\/projects\/[^/]+\/issues$/.test(pathname) ||
    /^\/views\/[^/]+$/.test(pathname) ||
    pathname === "/my-issues" ||
    pathname === "/favorites"
  );
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState<string>("");
  const [recents, setRecents] = useState<RecentItem[]>([]);

  const navigate = useNavigate();
  const location = useLocation();
  const { openIssue } = useIssueOverlay();
  const { results, isLoading, isStale } = useWorkspaceSearch(open ? query : "");

  // Escape closes without erasing: the query is kept for this browser session
  // so reopening search resumes the same search. Clearing the box clears it.
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    function handle() {
      setQuery(readSessionQuery());
      setRecents(recentItems());
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, handle);
    return () => window.removeEventListener(OPEN_EVENT, handle);
  }, []);

  useEffect(() => {
    if (open) writeSessionQuery(query);
  }, [open, query]);

  // The scope a result published survives the navigation search itself made,
  // and is dropped on the next one. It must never become a sticky "last team".
  const scopeNavPending = useRef(false);
  useEffect(() => {
    if (scopeNavPending.current) {
      scopeNavPending.current = false;
      return;
    }
    publishSearchScope(null);
  }, [location.key]);

  useShortcuts({
    [shortcutKeys("app.search")]: () => {
      openGlobalSearch();
      return true;
    },
  });

  useShortcuts(
    {
      [shortcutKeys("nav.escape")]: () => {
        close();
        return true;
      },
    },
    {
      priority: SHORTCUT_PRIORITY.dialog,
      enabled: open,
      allowWhileTyping: true,
    },
  );

  const counts = useMemo(
    () => ({
      issues: results.issues.length,
      projects: results.projects.length,
      cycles: results.cycles.length,
      views: results.views.length,
      members: results.members.length,
    }),
    [results],
  );

  const values = useMemo(
    () => [
      ...(query.trim() ? [] : recents.map((item) => `recent-${item.id}`)),
      ...results.issues.map((issue) => `issue-${issue.id}`),
      ...results.projects.map((project) => `project-${project.id}`),
      ...results.cycles.map((cycle) => `cycle-${cycle.id}`),
      ...results.views.map((view) => `view-${view.id}`),
      ...results.members.map((member) => `member-${member.id}`),
    ],
    [query, recents, results],
  );

  // Selection is controlled, so a value left over from the previous result set
  // would leave Enter pointing at a row that is no longer rendered.
  useEffect(() => {
    if (!values.includes(focused)) setFocused(values[0] ?? "");
  }, [values, focused]);

  useEffect(() => {
    if (!open) {
      publishSearchContext(null);
      return;
    }
    publishSearchContext({ query, focusedResult: focused || null, counts });
    return () => publishSearchContext(null);
  }, [open, query, focused, counts]);

  const go = useCallback(
    (
      item: RecentItem,
      useOverlay = false,
      scope: SearchScope | null = null,
    ) => {
      rememberRecent(item);
      // Carry the result's team/project/cycle so a property flow opened right
      // after this offers the right options. Short-lived by design.
      publishSearchScope(scope);
      scopeNavPending.current = true;
      if (
        useOverlay &&
        item.kind === "issue" &&
        hostsIssueView(location.pathname)
      ) {
        openIssue(item.id);
      } else {
        navigate(item.href);
      }
      close();
    },
    [close, location.pathname, navigate, openIssue],
  );

  const total =
    counts.issues +
    counts.projects +
    counts.cycles +
    counts.views +
    counts.members;
  const trimmed = query.trim();

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      commandProps={{
        loop: true,
        // Results arrive ranked; re-filtering them client-side would only
        // fight the server's ordering.
        shouldFilter: false,
        value: focused,
        onValueChange: setFocused,
      }}
    >
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search issues, projects, cycles and views…"
      />

      <CommandList className="max-h-[380px]">
        {trimmed && !isLoading && !isStale && total === 0 ? (
          <CommandEmpty className="px-3 py-8 text-center">
            <p className="text-[13px] text-foreground">
              No results for “{trimmed}”
            </p>
            <p className="beam-meta mt-1">
              Try an issue identifier, project, or keyword.
            </p>
          </CommandEmpty>
        ) : null}

        {!trimmed && recents.length ? (
          <CommandGroup heading="Recent">
            {recents.map((item) => (
              <Row
                key={`recent-${item.id}`}
                value={`recent-${item.id}`}
                onSelect={() => go(item, true)}
                icon={<RecentIcon kind={item.kind} />}
                primary={item.label}
                secondary={item.meta}
              />
            ))}
          </CommandGroup>
        ) : null}

        {!trimmed && !recents.length ? (
          <div className="px-3 py-8 text-center">
            <p className="beam-meta">
              Search the workspace by identifier, title, project or member.
            </p>
          </div>
        ) : null}

        <IssueResults issues={results.issues} onSelect={go} />
        <ProjectResults projects={results.projects} onSelect={go} />
        <CycleResults cycles={results.cycles} onSelect={go} />
        <ViewResults views={results.views} onSelect={go} />
        <MemberResults members={results.members} onSelect={go} />
      </CommandList>

      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5">
        <Hint token="Enter" label="Open" />
        <Hint token="Escape" label="Close" />
        <span className="beam-meta ms-auto flex items-center gap-1.5">
          Commands
          <KeyHint token={shortcutKeys("app.palette")} />
        </span>
      </div>
    </CommandDialog>
  );
}

function Hint({ token, label }: { token: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <KeyHint token={token} />
      <span className="beam-meta">{label}</span>
    </span>
  );
}

function RecentIcon({ kind }: { kind: RecentItem["kind"] }) {
  const className = "size-3.5 shrink-0 text-muted-foreground";
  if (kind === "project") return <IconFolder className={className} />;
  if (kind === "cycle") return <IconCalendarRepeat className={className} />;
  if (kind === "view") return <IconLayoutColumns className={className} />;
  return <IconSearch className={className} />;
}

/** One dense result line: icon, primary text, then muted metadata. */
function Row({
  value,
  onSelect,
  icon,
  primary,
  secondary,
  badges,
}: {
  value: string;
  onSelect: () => void;
  icon?: React.ReactNode;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
  badges?: React.ReactNode;
}) {
  return (
    <CommandItem
      value={value}
      onSelect={onSelect}
      className="items-center gap-2 text-[13px]"
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{primary}</span>
      {badges}
      {secondary ? (
        <span className="beam-meta hidden shrink-0 truncate sm:block">
          {secondary}
        </span>
      ) : null}
    </CommandItem>
  );
}

function StateBadge({
  label,
  tone,
}: {
  label: string;
  tone: "triage" | "muted";
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded border px-1 text-[10px] font-medium leading-[15px]",
        tone === "triage"
          ? "border-primary/30 bg-primary/10 text-primary"
          : "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      {label}
    </span>
  );
}

function IssueResults({
  issues,
  onSelect,
}: {
  issues: WorkspaceSearchResults["issues"];
  onSelect: SelectResult;
}) {
  if (issues.length === 0) return null;
  return (
    <CommandGroup heading="Issues">
      {issues.map((issue) => (
        <Row
          key={issue.id}
          value={`issue-${issue.id}`}
          onSelect={() =>
            onSelect(
              {
                kind: "issue",
                id: issue.identifier,
                label: `${issue.identifier}  ${issue.title}`,
                meta: `${issue.team.name} · ${issue.status.name}`,
                href: `/issue/${issue.identifier}`,
              },
              true,
              { teamKey: issue.team.key },
            )
          }
          icon={<StatusIcon status={issue.status} />}
          primary={
            <>
              <span className="me-2 font-mono text-[11px] text-muted-foreground">
                {issue.identifier}
              </span>
              {issue.title}
            </>
          }
          badges={
            <>
              {issue.triageStatus === "pending" ||
              issue.triageStatus === "snoozed" ? (
                <StateBadge label="Triage" tone="triage" />
              ) : null}
              {issue.archived ? (
                <StateBadge label="Archived" tone="muted" />
              ) : null}
              {issue.commentMatched ? (
                <StateBadge label="Comment" tone="muted" />
              ) : null}
            </>
          }
          secondary={
            <span className="flex items-center gap-1.5">
              {issue.team.name} · {issue.status.name}
              {issue.assignee ? (
                <MemberAvatar
                  member={{
                    id: issue.identifier,
                    name: issue.assignee.name,
                    kind: issue.assignee.kind,
                    avatarUrl: issue.assignee.avatarUrl,
                  }}
                  size={16}
                />
              ) : null}
            </span>
          }
        />
      ))}
    </CommandGroup>
  );
}

function ProjectResults({
  projects,
  onSelect,
}: {
  projects: WorkspaceSearchResults["projects"];
  onSelect: SelectResult;
}) {
  if (projects.length === 0) return null;
  return (
    <CommandGroup heading="Projects">
      {projects.map((project) => {
        const meta = [
          project.status.replace(/_/g, " "),
          project.teamKeys.join(", ") || null,
          formatShortDate(project.targetDate) || null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Row
            key={project.id}
            value={`project-${project.id}`}
            onSelect={() =>
              onSelect(
                {
                  kind: "project",
                  id: project.id,
                  label: project.name,
                  meta,
                  href: `/projects/${project.id}`,
                },
                false,
                {
                  projectId: project.id,
                  teamKey: project.teamKeys[0],
                },
              )
            }
            icon={
              <IconFolder className="size-3.5 shrink-0 text-muted-foreground" />
            }
            primary={project.name}
            secondary={meta}
          />
        );
      })}
    </CommandGroup>
  );
}

function CycleResults({
  cycles,
  onSelect,
}: {
  cycles: WorkspaceSearchResults["cycles"];
  onSelect: SelectResult;
}) {
  if (cycles.length === 0) return null;
  return (
    <CommandGroup heading="Cycles">
      {cycles.map((cycle) => {
        const label = `${cycle.team.key} ${cycleTitle(cycle)}`;
        const meta = `${formatShortDate(cycle.startsAt)} – ${formatShortDate(
          cycle.endsAt,
        )} · ${
          cycle.state === "active"
            ? "Current"
            : cycle.state === "upcoming"
              ? "Upcoming"
              : "Previous"
        }`;
        return (
          <Row
            key={cycle.id}
            value={`cycle-${cycle.id}`}
            onSelect={() =>
              onSelect(
                {
                  kind: "cycle",
                  id: cycle.id,
                  label,
                  meta,
                  href: `/team/${cycle.team.key}/cycles/${cycle.id}`,
                },
                false,
                { teamKey: cycle.team.key, cycleId: cycle.id },
              )
            }
            icon={
              <IconCalendarRepeat className="size-3.5 shrink-0 text-muted-foreground" />
            }
            primary={label}
            secondary={meta}
          />
        );
      })}
    </CommandGroup>
  );
}

function ViewResults({
  views,
  onSelect,
}: {
  views: WorkspaceSearchResults["views"];
  onSelect: SelectResult;
}) {
  if (views.length === 0) return null;
  return (
    <CommandGroup heading="Views">
      {views.map((view) => {
        const meta = [view.teamKey ?? "All teams", view.layout]
          .filter(Boolean)
          .join(" · ");
        return (
          <Row
            key={view.id}
            value={`view-${view.id}`}
            onSelect={() =>
              onSelect({
                kind: "view",
                id: view.id,
                label: view.name,
                meta,
                href: `/views/${view.id}`,
              })
            }
            icon={
              <IconLayoutColumns className="size-3.5 shrink-0 text-muted-foreground" />
            }
            primary={view.name}
            secondary={meta}
          />
        );
      })}
    </CommandGroup>
  );
}

function MemberResults({
  members,
  onSelect,
}: {
  members: WorkspaceSearchResults["members"];
  onSelect: SelectResult;
}) {
  if (members.length === 0) return null;
  return (
    <CommandGroup heading="Members">
      {members.map((member) => (
        <Row
          key={member.id}
          value={`member-${member.id}`}
          onSelect={() =>
            onSelect({
              kind: "view",
              id: `member-${member.id}`,
              label: member.name,
              meta: "Assigned issues",
              // Members have no profile page; their issues are the useful
              // destination, expressed as an ordinary view filter.
              href: `/my-issues?assignee=${member.id}`,
            })
          }
          icon={<MemberAvatar member={member} size={18} />}
          primary={member.name}
          secondary={
            member.kind === "agent" ? "Agent" : (member.email ?? "Human")
          }
        />
      ))}
    </CommandGroup>
  );
}
