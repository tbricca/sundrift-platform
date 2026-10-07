/**
 * The review queue.
 *
 * It is the ordinary issue surface — same IssueQuery, same engine, same rows,
 * same overlay and filter bar — with a scope tab strip and three review
 * controls per row. Accept and Decline open a compact panel rather than firing
 * straight away, because a review decision is only reversible by hand.
 */
import { IconCheck, IconClock, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { useIssueOverlay } from "@/components/issues/IssueOverlay";
import { useIssueSelection } from "@/components/issues/selection";
import type { WorkspaceTeam } from "@/components/issues/properties";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { KeyHint } from "@/components/ui/keycap";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import {
  snoozePresets,
  useTriageMutations,
  type AcceptOptions,
} from "@/hooks/use-triage-mutations";
import { useWorkspace } from "@/hooks/use-workspace";
import { publishTriageContext } from "@/lib/agent-triage-context";
import type { TriageAction } from "@/components/menus/IssueContextMenu";

import { TriageBulkActions } from "./TriageBulkActions";
import { TriageSettingsMenu } from "./TriageSettingsMenu";
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  TRIAGE_SCOPE_LABEL,
  triageQuery,
  type Priority,
  type TriageScope,
} from "@/lib/issue-query";
import { keys as shortcutKeys } from "@/lib/shortcuts";
import type { IssueListItem } from "@/lib/types";
import { cn } from "@/lib/utils";

const TABS: TriageScope[] = ["pending", "snoozed", "accepted", "declined"];

const selectClass =
  "h-7 min-w-0 cursor-pointer rounded-md border border-border bg-background px-1.5 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring";

type Panel =
  | { kind: "accept"; issue: IssueListItem }
  | { kind: "decline"; issue: IssueListItem }
  | null;

export function TriageQueue({ team }: { team: WorkspaceTeam | null }) {
  const [scope, setScope] = useState<TriageScope>("pending");
  const [panel, setPanel] = useState<Panel>(null);

  const baseQuery = useMemo(
    () => triageQuery(team?.id ?? "", scope),
    [team?.id, scope],
  );

  const selection = useIssueSelection();
  const { activeIdentifier } = useIssueOverlay();
  const { snooze, acceptMany, declineMany, snoozeMany } = useTriageMutations();

  const focused = useMemo(
    () =>
      selection.ordered.find((issue) => issue.id === selection.focusedId) ??
      null,
    [selection.ordered, selection.focusedId],
  );

  const focusedRef = useRef(focused);
  focusedRef.current = focused;
  const panelRef = useRef(panel);
  panelRef.current = panel;

  useEffect(() => {
    publishTriageContext({
      scope,
      pendingCount: team?.pendingTriageCount ?? 0,
      focusedIssue: focused?.identifier ?? null,
    });
    return () => publishTriageContext(null);
  }, [scope, team?.pendingTriageCount, focused?.identifier]);

  const openPanel = useCallback((kind: "accept" | "decline") => {
    const issue = focusedRef.current;
    if (!issue || panelRef.current) return false;
    setPanel({ kind, issue });
    return true;
  }, []);

  // Review keys sit above the list so `A` reviews rather than reassigns while
  // the queue is focused. The issue overlay still outranks them.
  useShortcuts(
    {
      [shortcutKeys("triage.accept")]: () => openPanel("accept"),
      [shortcutKeys("triage.decline")]: () => openPanel("decline"),
      [shortcutKeys("triage.snooze")]: () => {
        const issue = focusedRef.current;
        if (!issue || panelRef.current) return false;
        void snooze(issue, snoozePresets()[1].value());
        return true;
      },
    },
    {
      priority: SHORTCUT_PRIORITY.overlay,
      enabled: !activeIdentifier && scope === "pending",
    },
  );

  /**
   * A decision taken from a row's context menu. One issue opens the same
   * panel the row buttons open, so the reviewer still sees what they are
   * accepting; a multi-selection goes straight to the bulk path, where the
   * panel would have nothing meaningful to show.
   */
  const onTriage = useCallback(
    (action: TriageAction, issues: IssueListItem[]) => {
      if (issues.length > 1) {
        if (action === "accept") void acceptMany(issues);
        if (action === "decline") void declineMany(issues);
        if (action === "snooze") void snoozeMany(issues, snoozePresets()[1].value());
        return;
      }
      const issue = issues[0];
      if (!issue) return;
      if (action === "snooze") void snooze(issue, snoozePresets()[1].value());
      else setPanel({ kind: action, issue });
    },
    [acceptMany, declineMany, snoozeMany, snooze],
  );

  const rowActions = useCallback(
    (issue: IssueListItem) =>
      issue.triageStatus === "pending" || issue.triageStatus === "snoozed" ? (
        <TriageRowActions
          issue={issue}
          onAccept={() => setPanel({ kind: "accept", issue })}
          onDecline={() => setPanel({ kind: "decline", issue })}
        />
      ) : null,
    [],
  );

  return (
    <>
      <IssueViewSurface
        title={`${team?.name ?? "Team"} · Triage`}
        accessory={
          <span
            className="size-2.5 shrink-0 rounded-[3px]"
            style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
          />
        }
        baseQuery={baseQuery}
        context={{ type: "triage", id: team?.id }}
        team={team}
        rowActions={rowActions}
        emptyMessage={
          scope === "pending"
            ? "Nothing waiting for review."
            : `No ${TRIAGE_SCOPE_LABEL[scope].toLowerCase()} issues.`
        }
        tabs={
          <div
            role="tablist"
            aria-label="Triage scope"
            className="flex h-9 shrink-0 items-center gap-0.5 border-b border-border px-3"
          >
            {TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={scope === tab}
                onClick={() => setScope(tab)}
                className={cn(
                  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium transition-colors",
                  scope === tab
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                )}
              >
                {TRIAGE_SCOPE_LABEL[tab]}
                {tab === "pending" && team?.pendingTriageCount ? (
                  <span className="beam-meta text-primary">
                    {team.pendingTriageCount}
                  </span>
                ) : null}
              </button>
            ))}

            <span className="ms-auto flex items-center gap-2">
              <span className="hidden items-center gap-2 lg:flex">
                <ShortcutTip id="triage.accept" label="Accept" />
                <ShortcutTip id="triage.decline" label="Decline" />
                <ShortcutTip id="triage.snooze" label="Snooze" />
              </span>
              <TriageSettingsMenu team={team} />
            </span>
          </div>
        }
      />

      {panel?.kind === "accept" ? (
        <AcceptPanel
          issue={panel.issue}
          team={team}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel?.kind === "decline" ? (
        <DeclinePanel issue={panel.issue} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}

function ShortcutTip({
  id,
  label,
}: {
  id: "triage.accept" | "triage.decline" | "triage.snooze";
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span className="beam-meta">{label}</span>
      <KeyHint token={shortcutKeys(id)} />
    </span>
  );
}

function TriageRowActions({
  issue,
  onAccept,
  onDecline,
}: {
  issue: IssueListItem;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const { snooze } = useTriageMutations();

  return (
    <>
      <button
        type="button"
        onClick={onAccept}
        aria-label={`Accept ${issue.identifier}`}
        title="Accept"
        className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border border-transparent px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:border-emerald-600/30 hover:bg-emerald-600/10 hover:text-emerald-700 dark:hover:text-emerald-400"
      >
        <IconCheck className="size-3.5" />
        Accept
      </button>
      <button
        type="button"
        onClick={onDecline}
        aria-label={`Decline ${issue.identifier}`}
        title="Decline"
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <IconX className="size-3.5" />
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={`Snooze ${issue.identifier}`}
          title="Snooze"
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconClock className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {snoozePresets().map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              className="text-[13px]"
              onSelect={() => void snooze(issue, preset.value())}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
          <CustomSnoozeItem issue={issue} />
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

function CustomSnoozeItem({ issue }: { issue: IssueListItem }) {
  const { snooze } = useTriageMutations();
  return (
    <div className="flex items-center gap-2 px-2 py-1.5">
      <span className="beam-meta">Until</span>
      <input
        type="date"
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value;
          if (value) void snooze(issue, new Date(`${value}T09:00:00`));
        }}
        className={selectClass}
      />
    </div>
  );
}

/**
 * Compact review panel, docked like the bulk bar. Defaults are prefilled from
 * the issue and the team, so Enter is a safe confirm.
 */
function AcceptPanel({
  issue,
  team,
  onClose,
}: {
  issue: IssueListItem;
  team: WorkspaceTeam | null;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const { accept } = useTriageMutations();

  const statuses = team?.statuses ?? [];
  const defaultStatus =
    statuses.find((status) => status.id === issue.status.id)?.category !==
    "canceled"
      ? issue.status.id
      : (statuses.find((status) => status.category === "unstarted")?.id ??
        statuses[0]?.id ??
        "");

  const [values, setValues] = useState<AcceptOptions>({
    statusId: defaultStatus,
    assigneeId: issue.assignee?.id ?? team?.defaultTriageAssigneeId ?? null,
    priority: issue.priority,
    projectId: issue.project?.id ?? null,
    cycleId: issue.cycle?.id ?? null,
  });

  const confirm = useCallback(() => {
    void accept(issue, values);
    onClose();
  }, [accept, issue, values, onClose]);

  useShortcuts(
    {
      Enter: () => {
        confirm();
        return true;
      },
      Escape: () => {
        onClose();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, allowWhileTyping: true },
  );

  return (
    <PanelShell
      label={`Accept ${issue.identifier}`}
      confirmLabel="Accept"
      onConfirm={confirm}
      onClose={onClose}
      tone="positive"
    >
      <select
        aria-label="Status"
        value={values.statusId ?? ""}
        onChange={(event) =>
          setValues((current) => ({ ...current, statusId: event.target.value }))
        }
        className={selectClass}
      >
        {statuses.map((status) => (
          <option key={status.id} value={status.id}>
            {status.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Assignee"
        value={values.assigneeId ?? ""}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            assigneeId: event.target.value || null,
          }))
        }
        className={selectClass}
      >
        <option value="">Unassigned</option>
        {(workspace?.members ?? []).map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
            {member.kind === "agent" ? " (agent)" : ""}
          </option>
        ))}
      </select>

      <select
        aria-label="Priority"
        value={values.priority ?? "none"}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            priority: event.target.value as Priority,
          }))
        }
        className={selectClass}
      >
        {PRIORITY_ORDER.map((priority) => (
          <option key={priority} value={priority}>
            {PRIORITY_LABEL[priority]}
          </option>
        ))}
      </select>

      <select
        aria-label="Project"
        value={values.projectId ?? ""}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            projectId: event.target.value || null,
          }))
        }
        className={selectClass}
      >
        <option value="">No project</option>
        {(workspace?.projects ?? []).map((project) => (
          <option key={project.id} value={project.id}>
            {project.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Cycle"
        value={values.cycleId ?? ""}
        onChange={(event) =>
          setValues((current) => ({
            ...current,
            cycleId: event.target.value || null,
          }))
        }
        className={selectClass}
      >
        <option value="">No cycle</option>
        {(team?.cycles ?? []).map((cycle) => (
          <option key={cycle.id} value={cycle.id}>
            {cycle.name || `Cycle ${cycle.number}`}
          </option>
        ))}
      </select>
    </PanelShell>
  );
}

function DeclinePanel({
  issue,
  onClose,
}: {
  issue: IssueListItem;
  onClose: () => void;
}) {
  const { decline } = useTriageMutations();
  const [reason, setReason] = useState("");

  const confirm = useCallback(() => {
    void decline(issue, reason);
    onClose();
  }, [decline, issue, reason, onClose]);

  useShortcuts(
    {
      Enter: () => {
        confirm();
        return true;
      },
      Escape: () => {
        onClose();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, allowWhileTyping: true },
  );

  return (
    <PanelShell
      label={`Decline ${issue.identifier}?`}
      confirmLabel="Decline"
      onConfirm={confirm}
      onClose={onClose}
      tone="destructive"
    >
      <input
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="Reason (optional)"
        className="h-7 min-w-[220px] flex-1 rounded-md border border-border bg-background px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </PanelShell>
  );
}

function PanelShell({
  label,
  confirmLabel,
  tone,
  onConfirm,
  onClose,
  children,
}: {
  label: string;
  confirmLabel: string;
  tone: "positive" | "destructive";
  onConfirm: () => void;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
      <div
        role="dialog"
        aria-label={label}
        className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-2 shadow-[0_8px_24px_rgba(16,18,32,0.12)]"
      >
        <span className="text-[12px] font-medium">{label}</span>
        {children}
        <button
          type="button"
          onClick={onClose}
          className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium text-white transition-opacity hover:opacity-90",
            tone === "positive" ? "bg-emerald-600" : "bg-destructive",
          )}
        >
          {confirmLabel}
          <KeyHint
            token="Enter"
            className="[&>kbd]:border-white/30 [&>kbd]:bg-white/15 [&>kbd]:text-white"
          />
        </button>
      </div>
    </div>
  );
}
