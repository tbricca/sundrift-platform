/**
 * Create or edit one recurring rule.
 *
 * The schedule is expressed as controls, never as cron: a cadence, an interval,
 * the days it applies to, a wall-clock time and a zone. The sentence under the
 * fields is the same `describeSchedule` the list uses, so what a person reads
 * while editing is exactly what they will read afterwards.
 */

import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useTemplates } from "@/components/templates/useTemplates";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspace } from "@/hooks/use-workspace";
import { invalidateRecurring } from "@/lib/query-keys";
import { CADENCES, describeSchedule, type Cadence } from "@/lib/recurrence";
import { cn } from "@/lib/utils";

import type { RecurringRule } from "./RecurringList";

const WEEKDAY_LABEL = ["S", "M", "T", "W", "T", "F", "S"];

const CYCLE_MODES = [
  { value: "none", label: "No cycle" },
  { value: "current_cycle", label: "Current cycle" },
  { value: "next_cycle", label: "Next cycle" },
] as const;

/** The zone the browser is in, as a sensible default for a new rule. */
function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function RecurringDialog({
  draft,
  teamId,
  onClose,
}: {
  /** An existing rule to edit, "new" for a fresh one, or null when closed. */
  draft: RecurringRule | "new" | null;
  teamId: string | undefined;
  onClose: () => void;
}) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { templates } = useTemplates(teamId);

  const existing = draft && draft !== "new" ? draft : null;

  const [name, setName] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [cadence, setCadence] = useState<Cadence>("weekly");
  const [interval, setInterval] = useState("1");
  const [weekdays, setWeekdays] = useState<number[]>([1]);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [timezone, setTimezone] = useState(localTimeZone());
  const [cycleMode, setCycleMode] =
    useState<RecurringRule["cycleMode"]>("none");
  const [endsAt, setEndsAt] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!draft) return;
    setName(existing?.name ?? "");
    setTemplateId(existing?.templateId ?? "");
    setCadence(existing?.cadence ?? "weekly");
    setInterval(String(existing?.interval ?? 1));
    setWeekdays(existing?.weekdays ?? [1]);
    setDayOfMonth(String(existing?.dayOfMonth ?? 1));
    setTimeOfDay(existing?.timeOfDay ?? "09:00");
    setTimezone(existing?.timezone ?? localTimeZone());
    setCycleMode(existing?.cycleMode ?? "none");
    setEndsAt(existing?.endsAt ? existing.endsAt.slice(0, 10) : "");
  }, [draft, existing]);

  if (!draft) return null;

  const team = workspace?.teams.find((entry) => entry.id === teamId) ?? null;
  const parsedInterval = Math.max(1, Number(interval) || 1);

  const summary = describeSchedule({
    cadence,
    interval: parsedInterval,
    weekdays,
    dayOfMonth: Number(dayOfMonth) || 1,
    timeOfDay,
  });

  function toggleWeekday(day: number) {
    setWeekdays((current) =>
      current.includes(day)
        ? current.filter((entry) => entry !== day)
        : [...current, day].sort((a, b) => a - b),
    );
  }

  async function submit() {
    if (!name.trim() || !templateId) return;
    setPending(true);

    const payload = {
      name: name.trim(),
      templateId,
      cadence,
      interval: parsedInterval,
      weekdays: cadence === "weekly" ? weekdays : undefined,
      dayOfMonth: cadence === "monthly" ? Number(dayOfMonth) || 1 : undefined,
      timeOfDay,
      timezone,
      cycleMode,
      // A date input gives a local day; the end of that day is the intent.
      endsAt: endsAt
        ? new Date(`${endsAt}T23:59:59`).toISOString()
        : undefined,
    };

    try {
      if (existing) {
        await callAction(
          "update-recurring-issue",
          { id: existing.id, ...payload },
          { method: "PUT" },
        );
      } else {
        await callAction("create-recurring-issue", { teamId, ...payload });
      }
      invalidateRecurring(queryClient);
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save the rule.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent className="max-w-lg gap-0 overflow-visible p-0">
        <DialogTitle className="sr-only">
          {existing ? "Edit recurring rule" : "New recurring rule"}
        </DialogTitle>
        <DialogDescription className="sr-only">
          A schedule that files an issue from a template.
        </DialogDescription>

        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: team?.color ?? "#8b8f9c" }}
          />
          <span className="beam-meta">{team?.key ?? "Team"}</span>
          <span className="text-[13px] font-medium">
            {existing ? "Edit recurring rule" : "New recurring rule"}
          </span>
        </div>

        <div className="flex flex-col gap-3 px-4 py-3">
          <Input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Rule name, e.g. Weekly ingestion review"
            className="h-8 text-[13px]"
          />

          <Field label="Template">
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="h-7 w-full rounded-md border border-border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Choose a template…</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Repeats">
            <div className="flex items-center gap-2">
              <span className="beam-meta font-normal">Every</span>
              <Input
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                inputMode="numeric"
                className="h-7 w-14 text-[13px]"
              />
              <select
                value={cadence}
                onChange={(event) => setCadence(event.target.value as Cadence)}
                className="h-7 rounded-md border border-border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CADENCES.map((option) => (
                  <option key={option} value={option}>
                    {option === "daily"
                      ? parsedInterval === 1
                        ? "day"
                        : "days"
                      : option === "weekly"
                        ? parsedInterval === 1
                          ? "week"
                          : "weeks"
                        : parsedInterval === 1
                          ? "month"
                          : "months"}
                  </option>
                ))}
              </select>
            </div>
          </Field>

          {cadence === "weekly" ? (
            <Field label="On">
              <div className="flex items-center gap-1">
                {WEEKDAY_LABEL.map((label, day) => (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={weekdays.includes(day)}
                    aria-label={
                      [
                        "Sunday",
                        "Monday",
                        "Tuesday",
                        "Wednesday",
                        "Thursday",
                        "Friday",
                        "Saturday",
                      ][day]
                    }
                    onClick={() => toggleWeekday(day)}
                    className={cn(
                      "size-7 cursor-pointer rounded-md border text-[12px] font-medium transition-colors",
                      weekdays.includes(day)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:bg-accent",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {cadence === "monthly" ? (
            <Field label="Day of month">
              <Input
                value={dayOfMonth}
                onChange={(event) => setDayOfMonth(event.target.value)}
                inputMode="numeric"
                className="h-7 w-16 text-[13px]"
              />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field label="At">
              <Input
                type="time"
                value={timeOfDay}
                onChange={(event) => setTimeOfDay(event.target.value)}
                className="h-7 text-[13px]"
              />
            </Field>
            <Field label="Time zone">
              <Input
                value={timezone}
                onChange={(event) => setTimezone(event.target.value)}
                placeholder="America/Los_Angeles"
                className="h-7 text-[13px]"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Cycle">
              <select
                value={cycleMode}
                onChange={(event) =>
                  setCycleMode(
                    event.target.value as RecurringRule["cycleMode"],
                  )
                }
                className="h-7 w-full rounded-md border border-border bg-background px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {CYCLE_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ends">
              <Input
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
                className="h-7 text-[13px]"
              />
            </Field>
          </div>

          <p className="beam-meta font-normal leading-relaxed">
            {summary} ({timezone}). The time stays put across daylight saving.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-7 cursor-pointer rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || !name.trim() || !templateId}
            onClick={() => void submit()}
            className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {existing ? "Save" : "Create rule"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="beam-meta uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}
