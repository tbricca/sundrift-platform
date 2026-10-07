/**
 * One palette for the whole app.
 *
 * It owns no business logic: property flows read their options straight from
 * the issue-property registry and write through the same bulk/single mutation
 * hooks the UI uses, create commands open the existing dialogs, and navigation
 * uses workspace metadata that is already loaded.
 *
 * Context comes from the current selection, the focused row, and the route, so
 * the same shortcut means "act on these seven issues" in a list and "go
 * somewhere" on a settings page.
 */
import { IconChevronLeft } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";

import { openCreateIssue } from "@/components/issues/CreateIssueDialog";
import { selectionScope } from "@/components/issues/BulkActionBar";
import { useTemplates } from "@/components/templates/useTemplates";
import { useCommandRunner } from "@/hooks/use-command-runner";
import type { MenuActionId } from "./command-menu";

import { TemplateFlow } from "./TemplateFlow";
import {
  PROPERTY_DEFS,
  type PropertyContext,
  type PropertyId,
  type PropertyOption,
} from "@/components/issues/properties";
import { useIssueSelectionOptional } from "@/components/issues/selection";
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
import { readSearchScope } from "@/lib/search-session";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import { useWorkspace } from "@/hooks/use-workspace";
import { cycleState, cycleTitle } from "@/lib/cycle";
import { cn } from "@/lib/utils";

import {
  COMMANDS,
  PALETTE_PROPERTIES,
  PROPERTY_KEYWORDS,
  PROPERTY_SHORTCUTS,
  type CommandContext,
} from "./commands";

const OPEN_EVENT = "beam:command-palette";

export function openCommandPalette(property?: PropertyId) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { property } }));
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [property, setProperty] = useState<PropertyId | null>(null);
  const [search, setSearch] = useState("");
  /**
   * Second step of "Create issue from template". `null` means the flow is off;
   * an empty string means it is on but a team still has to be picked.
   */
  const [templateTeamId, setTemplateTeamId] = useState<string | null>(null);

  const selection = useIssueSelectionOptional();
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const runner = useCommandRunner();

  // The focused row counts as the target when nothing is explicitly selected,
  // which is what makes Cmd+K feel like it acts on "this issue".
  const targets = useMemo(() => {
    if (!selection) return [];
    if (selection.selected.length) return selection.selected;
    const focused = selection.ordered.find(
      (issue) => issue.id === selection.focusedId,
    );
    return focused ? [focused] : [];
  }, [selection]);

  const scope = useMemo(
    () => selectionScope(targets, workspace ?? null),
    [targets, workspace],
  );

  const routeTeam = useMemo(() => {
    const key = params.teamKey?.toUpperCase();
    return key
      ? (workspace?.teams.find((team) => team.key === key) ?? null)
      : null;
  }, [params.teamKey, workspace]);

  /**
   * Opening a search result can land somewhere the route says nothing about
   * the team — an issue overlay over My Issues, for instance. The result's own
   * scope fills that gap so status and cycle options are the right team's.
   * Route and selection still win; this is only a fallback.
   */
  const searchScope = readSearchScope();
  const scopedTeam = useMemo(() => {
    if (!searchScope?.teamKey) return null;
    return (
      workspace?.teams.find((team) => team.key === searchScope.teamKey) ?? null
    );
  }, [searchScope?.teamKey, workspace]);

  const ctx: PropertyContext = useMemo(
    () => ({
      workspace: workspace ?? null,
      team: scope.team ?? routeTeam ?? scopedTeam,
      projectId:
        scope.projectId ?? params.projectId ?? searchScope?.projectId ?? null,
    }),
    [
      workspace,
      scope.team,
      scope.projectId,
      routeTeam,
      scopedTeam,
      params.projectId,
      searchScope?.projectId,
    ],
  );

  const commandContext: CommandContext = {
    count: selection?.selected.length ?? 0,
    hasIssue: targets.length > 0,
    hasTeam: Boolean(routeTeam ?? scope.team),
    hasProject: Boolean(params.projectId),
    hasCycle: Boolean(params.cycleId),
    inInbox: location.pathname.startsWith("/inbox"),
    hasTriage: Boolean((routeTeam ?? scope.team)?.triageEnabled),
    anyArchived: targets.some((issue) => issue.archivedAt),
    allArchived:
      targets.length > 0 && targets.every((issue) => issue.archivedAt),
  };

  const close = useCallback(() => {
    setOpen(false);
    setProperty(null);
    setTemplateTeamId(null);
    setSearch("");
  }, []);

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent).detail as
        { property?: PropertyId } | undefined;
      setProperty(detail?.property ?? null);
      setSearch("");
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, handle);
    return () => window.removeEventListener(OPEN_EVENT, handle);
  }, []);

  useShortcuts(
    {
      [shortcutKeys("app.palette")]: () => {
        setOpen((current) => !current);
        setProperty(null);
        setSearch("");
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, allowWhileTyping: true },
  );

  // Claim Escape while open so closing the palette never also clears the
  // selection underneath it.
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


  /** What every palette command acts on. */
  const commandTarget = useMemo(
    () => ({
      issues: targets,
      ctx,
      path: location.pathname,
      teamId: (routeTeam ?? scope.team)?.id ?? null,
      teamKey: (routeTeam ?? scope.team)?.key ?? null,
      projectId: params.projectId ?? null,
    }),
    [targets, ctx, location.pathname, routeTeam, scope.team, params.projectId],
  );

  const applyProperty = useCallback(
    (id: PropertyId, option: PropertyOption) => {
      runner.applyProperty(commandTarget, id, option);
      close();
    },
    [runner, commandTarget, close],
  );

  function runCommand(id: string) {
    // The one command the palette owns: it opens a nested step here rather
    // than executing, then hands off to the create dialog.
    if (id === "create-issue-from-template") {
      setTemplateTeamId(ctx.team?.id ?? "");
      setSearch("");
      return;
    }

    runner.runCommand(id as MenuActionId, commandTarget);
    close();
  }

  const activeDef = property ? PROPERTY_DEFS[property] : null;
  const options = activeDef ? activeDef.options(ctx) : [];

  const inTemplateFlow = templateTeamId !== null;
  const { templates } = useTemplates(templateTeamId || undefined);

  const heading =
    commandContext.count > 1
      ? `Commands for ${commandContext.count} issues`
      : targets[0]
        ? `Commands for ${targets[0].identifier}`
        : "Commands";

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? setOpen(true) : close())}
      commandProps={{ loop: true }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
        {activeDef ? (
          <button
            type="button"
            aria-label="Back to all commands"
            onClick={() => {
              setProperty(null);
              setSearch("");
            }}
            className="inline-flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded border border-border px-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconChevronLeft className="size-3" />
            {activeDef.label}
          </button>
        ) : (
          <span className="beam-meta shrink-0">{heading}</span>
        )}
      </div>

      <CommandInput
        autoFocus
        value={search}
        onValueChange={setSearch}
        placeholder={
          activeDef
            ? `Set ${activeDef.label.toLowerCase()}…`
            : "Type a command…"
        }
      />

      <CommandList className="max-h-[320px]">
        <CommandEmpty className="py-6 text-center text-[13px] text-muted-foreground">
          No matching commands.
        </CommandEmpty>

        {activeDef ? (
          <CommandGroup>
            {options.map((option) => (
              <CommandItem
                key={String(option.value)}
                value={`${option.label} ${option.group ?? ""} ${option.keywords ?? ""}`}
                onSelect={() => applyProperty(activeDef.id, option)}
                className="gap-2 text-[13px]"
              >
                {option.icon}
                <span className="truncate">{option.label}</span>
                {option.group ? (
                  <span className="beam-meta ms-auto">{option.group}</span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <>
            {targets.length ? (
              <CommandGroup heading="Change">
                {PALETTE_PROPERTIES.filter((id) =>
                  // A milestone needs one shared project; a status or cycle
                  // needs one team. Otherwise the flow cannot be honest.
                  id === "milestone"
                    ? scope.sameProject && scope.projectId
                    : id === "status" || id === "cycle"
                      ? scope.singleTeam
                      : true,
                ).map((id) => {
                  const def = PROPERTY_DEFS[id];
                  return (
                    <CommandItem
                      key={id}
                      value={`${def.label} ${PROPERTY_KEYWORDS[id] ?? ""}`}
                      onSelect={() => {
                        setProperty(id);
                        setSearch("");
                      }}
                      className="gap-2 text-[13px]"
                    >
                      <def.icon className="size-3.5 text-muted-foreground" />
                      {id === "labels"
                        ? "Add label"
                        : `Change ${def.label.toLowerCase()}`}
                      <span className="ms-auto flex items-center gap-1.5">
                        {PROPERTY_SHORTCUTS[id] ? (
                          <KeyHint
                            token={shortcutKeys(PROPERTY_SHORTCUTS[id]!)}
                          />
                        ) : null}
                        <span className="beam-meta">›</span>
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {(["Issue", "Project", "Cycle", "Create", "Navigate"] as const).map(
              (group) => {
                const items = COMMANDS.filter(
                  (command) =>
                    command.group === group &&
                    command.available(commandContext),
                );
                if (items.length === 0) return null;
                return (
                  <CommandGroup key={group} heading={group}>
                    {items.map((command) => (
                      <CommandItem
                        key={command.id}
                        value={`${command.label} ${command.keywords ?? ""}`}
                        onSelect={() => runCommand(command.id)}
                        className={cn(
                          "gap-2 text-[13px]",
                          command.destructive && "text-destructive",
                        )}
                      >
                        {command.label}
                        {command.shortcut ? (
                          <KeyHint
                            token={shortcutKeys(command.shortcut)}
                            className="ms-auto"
                          />
                        ) : null}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                );
              },
            )}

            <NavigationCommands
              onNavigate={(to) => {
                navigate(to);
                close();
              }}
            />
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}

/** Fuzzy navigation over workspace metadata that is already in memory. */
function NavigationCommands({
  onNavigate,
}: {
  onNavigate: (to: string) => void;
}) {
  const { workspace } = useWorkspace();
  if (!workspace) return null;

  return (
    <>
      <CommandGroup heading="Teams">
        {workspace.teams.map((team) => (
          <CommandItem
            key={team.id}
            value={`${team.name} ${team.key} team`}
            onSelect={() => onNavigate(`/team/${team.key}/issues`)}
            className="gap-2 text-[13px]"
          >
            <span
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: team.color ?? "#8b8f9c" }}
            />
            {team.name}
          </CommandItem>
        ))}
      </CommandGroup>

      <CommandGroup heading="Cycles">
        {workspace.teams.flatMap((team) =>
          team.cycles
            .filter((cycle) => cycleState(cycle) !== "completed")
            .map((cycle) => (
              <CommandItem
                key={cycle.id}
                value={`${team.key} ${cycleTitle(cycle)} ${cycle.name ?? ""} sprint`}
                onSelect={() =>
                  onNavigate(`/team/${team.key}/cycles/${cycle.id}`)
                }
                className="gap-2 text-[13px]"
              >
                {team.key} · {cycleTitle(cycle)}
                <span className="beam-meta ms-auto">
                  {cycleState(cycle) === "active" ? "Current" : "Upcoming"}
                </span>
              </CommandItem>
            )),
        )}
      </CommandGroup>

      <CommandGroup heading="Projects">
        {workspace.projects.map((project) => (
          <CommandItem
            key={project.id}
            value={`${project.name} project`}
            onSelect={() => onNavigate(`/projects/${project.id}`)}
            className="gap-2 text-[13px]"
          >
            {project.name}
          </CommandItem>
        ))}
      </CommandGroup>

      <CommandGroup heading="Saved views">
        {workspace.views.map((view) => (
          <CommandItem
            key={view.id}
            value={`${view.name} view`}
            onSelect={() => onNavigate(`/views/${view.id}`)}
            className="gap-2 text-[13px]"
          >
            {view.name}
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
