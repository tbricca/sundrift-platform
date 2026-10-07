/**
 * The recurring rules management surface.
 *
 * Deliberately the same shape as `TemplateList` — a dense list, an inline Edit,
 * a `...` menu — because these two settings pages sit next to each other and a
 * second visual idiom for the same kind of work would be noise.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";

import { IconAlertTriangle, IconDots, IconPlus } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { RecurringDialog } from "@/components/recurring/RecurringDialog";
import { RunHistory } from "@/components/recurring/RunHistory";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { describeSchedule } from "@/lib/recurrence";
import { invalidateRecurring } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type RecurringRule = {
  id: string;
  name: string;
  enabled: boolean;
  cadence: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays: number[] | null;
  dayOfMonth: number | null;
  timeOfDay: string;
  timezone: string;
  cycleMode: "none" | "current_cycle" | "next_cycle";
  templateId: string | null;
  templateName: string | null;
  templateArchived: boolean;
  assigneeId: string | null;
  projectId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  archivedAt: string | null;
};

type Response = {
  team: { id: string; key: string; name: string };
  definitions: RecurringRule[];
} | null;

/** "in 3 days", "2 hours ago" — enough to judge a schedule at a glance. */
function relative(iso: string | null): string {
  if (!iso) return "—";
  const delta = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(delta);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);

  const amount =
    minutes < 60 ? `${minutes}m` : hours < 48 ? `${hours}h` : `${days}d`;
  return delta >= 0 ? `in ${amount}` : `${amount} ago`;
}

export function RecurringList({
  teamKey,
  teamId,
}: {
  teamKey: string;
  teamId: string | undefined;
}) {
  const queryClient = useQueryClient();
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<RecurringRule | "new" | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = useActionQuery<Response>(
    "list-recurring-issues",
    { teamKey, includeArchived: showArchived },
    { enabled: Boolean(teamKey) },
  );

  const rules = query.data?.definitions ?? [];
  const needle = search.trim().toLowerCase();
  const visible = needle
    ? rules.filter((rule) =>
        `${rule.name} ${rule.templateName ?? ""}`.toLowerCase().includes(needle),
      )
    : rules;

  const refresh = () => invalidateRecurring(queryClient);

  async function patch(rule: RecurringRule, changes: Record<string, unknown>) {
    try {
      await callAction(
        "update-recurring-issue",
        { id: rule.id, ...changes },
        { method: "PUT" },
      );
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update that rule.",
      );
    }
  }

  async function duplicate(rule: RecurringRule) {
    // Rules are always created with a template. This satisfies the nullable
    // column rather than guarding a state a user can reach.
    if (!rule.templateId) return;

    try {
      await callAction("create-recurring-issue", {
        teamId,
        name: `Copy of ${rule.name}`,
        templateId: rule.templateId,
        cadence: rule.cadence,
        interval: rule.interval,
        weekdays: rule.weekdays ?? undefined,
        dayOfMonth: rule.dayOfMonth ?? undefined,
        timeOfDay: rule.timeOfDay,
        timezone: rule.timezone,
        cycleMode: rule.cycleMode,
        assigneeId: rule.assigneeId ?? undefined,
        projectId: rule.projectId ?? undefined,
        // A copy starts switched off, so duplicating never quietly doubles the
        // issues a team receives.
        enabled: false,
      });
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not duplicate that.",
      );
    }
  }

  async function runNow(rule: RecurringRule) {
    try {
      await callAction("run-recurring-issue-now", { id: rule.id });
      toast.success(`${rule.name} created an issue`);
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not run that rule.",
      );
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search recurring rules…"
          className="h-7 max-w-56 text-[13px]"
        />
        <button
          type="button"
          onClick={() => setShowArchived((current) => !current)}
          className={cn(
            "h-7 cursor-pointer rounded-md px-2 text-[12px] transition-colors",
            showArchived
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
          )}
        >
          Archived
        </button>
        <button
          type="button"
          disabled={!teamId}
          onClick={() => setDraft("new")}
          className="ms-auto inline-flex h-7 cursor-pointer items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <IconPlus className="size-3.5" />
          New rule
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {query.isLoading ? null : visible.length === 0 ? (
          <p className="p-8 text-center text-[13px] text-muted-foreground">
            {needle
              ? "No rules match that search."
              : "No recurring rules yet. Create one to file the same issue on a schedule."}
          </p>
        ) : (
          visible.map((rule) => (
            <div key={rule.id} className="border-b border-border">
              <div className="group/rule flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "truncate text-[13px] font-medium",
                        !rule.enabled && "text-muted-foreground",
                      )}
                    >
                      {rule.name}
                    </span>
                    {!rule.enabled ? (
                      <span className="beam-meta rounded bg-muted px-1">
                        Paused
                      </span>
                    ) : null}
                    {rule.archivedAt ? (
                      <span className="beam-meta rounded bg-muted px-1">
                        Archived
                      </span>
                    ) : null}
                    {rule.templateArchived ? (
                      <span className="beam-meta inline-flex items-center gap-1 rounded bg-destructive/10 px-1 text-destructive">
                        <IconAlertTriangle className="size-3" />
                        Template archived
                      </span>
                    ) : null}
                  </div>

                  <p className="truncate text-[12px] text-muted-foreground">
                    {describeSchedule(rule)} · {rule.timezone}
                  </p>

                  <p className="beam-meta mt-0.5 truncate">
                    {rule.templateName ?? "No template"}
                    {" · next "}
                    {rule.enabled ? relative(rule.nextRunAt) : "paused"}
                    {rule.lastRunAt ? ` · last ${relative(rule.lastRunAt)}` : ""}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setExpanded((current) =>
                      current === rule.id ? null : rule.id,
                    )
                  }
                  className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {expanded === rule.id ? "Hide runs" : "Runs"}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(rule)}
                  className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover/rule:opacity-100"
                >
                  Edit
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
                    <IconDots className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem
                      className="text-[13px]"
                      onSelect={() => void runNow(rule)}
                    >
                      Run now
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[13px]"
                      onSelect={() =>
                        void patch(rule, { enabled: !rule.enabled })
                      }
                    >
                      {rule.enabled ? "Pause" : "Resume"}
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-[13px]"
                      onSelect={() => void duplicate(rule)}
                    >
                      Duplicate
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-[13px] text-destructive focus:text-destructive"
                      onSelect={() =>
                        void patch(rule, { archived: !rule.archivedAt })
                      }
                    >
                      {rule.archivedAt ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {expanded === rule.id ? <RunHistory ruleId={rule.id} /> : null}
            </div>
          ))
        )}
      </div>

      <RecurringDialog
        draft={draft}
        teamId={teamId}
        onClose={() => setDraft(null)}
      />
    </div>
  );
}
