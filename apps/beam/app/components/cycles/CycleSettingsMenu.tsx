/**
 * Five fields on the team row, so the settings are a popover rather than a
 * settings page.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { IconSettings } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

export type CycleSettings = {
  cyclesEnabled: boolean;
  durationWeeks: number;
  startDay: number;
  autoCreate: boolean;
  autoRollover: boolean;
};

const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-[13px]">{label}</span>
        {hint ? <span className="beam-meta block">{hint}</span> : null}
      </span>
      {children}
    </div>
  );
}

export function CycleSettingsMenu({
  teamId,
  settings,
}: {
  teamId: string;
  settings: CycleSettings;
}) {
  const queryClient = useQueryClient();

  async function save(patch: Partial<CycleSettings>) {
    try {
      await callAction(
        "update-team-cycle-settings",
        { teamId, ...patch },
        { method: "PUT" },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that setting.",
      );
    } finally {
      void queryClient.invalidateQueries({ queryKey: ["action", "list-cycles"] });
    }
  }

  const selectClass =
    "h-7 cursor-pointer rounded-md border border-border bg-transparent px-1.5 text-[12px] outline-none";

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Cycle settings"
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <IconSettings className="size-3.5" />
        Settings
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Cycle settings
        </p>

        <Row label="Cycles enabled">
          <Switch
            checked={settings.cyclesEnabled}
            onCheckedChange={(value) => void save({ cyclesEnabled: value })}
          />
        </Row>

        <Row label="Cycle length">
          <select
            value={settings.durationWeeks}
            onChange={(event) =>
              void save({ durationWeeks: Number(event.target.value) })
            }
            className={selectClass}
          >
            {[1, 2, 3, 4, 6, 8].map((weeks) => (
              <option key={weeks} value={weeks}>
                {weeks} {weeks === 1 ? "week" : "weeks"}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Starts on">
          <select
            value={settings.startDay}
            onChange={(event) =>
              void save({ startDay: Number(event.target.value) })
            }
            className={selectClass}
          >
            {WEEKDAYS.map((day, index) => (
              <option key={day} value={index}>
                {day}
              </option>
            ))}
          </select>
        </Row>

        <Row
          label="Create upcoming cycles"
          hint="Keeps two cycles queued ahead."
        >
          <Switch
            checked={settings.autoCreate}
            onCheckedChange={(value) => void save({ autoCreate: value })}
          />
        </Row>

        <Row
          label="Roll over unfinished issues"
          hint="Moves them on when a cycle ends."
        >
          <Switch
            checked={settings.autoRollover}
            onCheckedChange={(value) => void save({ autoRollover: value })}
          />
        </Row>
      </PopoverContent>
    </Popover>
  );
}
