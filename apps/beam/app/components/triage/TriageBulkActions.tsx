/**
 * Accept, Decline and Snooze for the current triage selection, rendered inside
 * the ordinary bulk action bar so triage does not grow a second selection UI.
 *
 * Overrides on Accept follow the same compatibility rule as everything else:
 * assignee and priority are always safe, so they are offered; status and cycle
 * would need one team, and the plain Accept path already resolves each issue's
 * own team default, which is the behaviour a mixed selection wants.
 */
import { IconClock } from "@tabler/icons-react";
import { useState } from "react";

import {
  PROPERTY_DEFS,
  PropertyOptionList,
  type PropertyContext,
} from "@/components/issues/properties";
import { useIssueSelection } from "@/components/issues/selection";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { snoozePresets, useTriageMutations } from "@/hooks/use-triage-mutations";
import type { IssueListItem } from "@/lib/types";

export function TriageBulkActions({ ctx }: { ctx: PropertyContext }) {
  const { selected, clear } = useIssueSelection();
  const { acceptMany, declineMany, snoozeMany } = useTriageMutations();

  // Only unreviewed issues can be reviewed; a selection made on the Accepted
  // tab has nothing for these buttons to do.
  const reviewable = selected.filter(
    (issue) =>
      issue.triageStatus === "pending" || issue.triageStatus === "snoozed",
  );

  if (reviewable.length === 0) return null;

  const after = (run: Promise<unknown>) => {
    void run.then(() => clear());
  };

  return (
    <>
      <button
        type="button"
        onClick={() => after(acceptMany(reviewable))}
        className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md bg-primary px-2.5 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
      >
        Accept {reviewable.length}
      </button>

      <AcceptWithOverride
        ctx={ctx}
        issues={reviewable}
        onAccept={(options) => after(acceptMany(reviewable, options))}
      />

      <DeclineButton
        count={reviewable.length}
        onDecline={(reason) => after(declineMany(reviewable, reason))}
      />

      <DropdownMenu>
        <DropdownMenuTrigger className="inline-flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
          <IconClock className="size-3.5" />
          Snooze
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {snoozePresets().map((preset) => (
            <DropdownMenuItem
              key={preset.label}
              className="text-[13px]"
              onSelect={() => after(snoozeMany(reviewable, preset.value()))}
            >
              {preset.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <CustomSnoozeItem
            onPick={(date) => after(snoozeMany(reviewable, date))}
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="mx-1 h-4 w-px shrink-0 bg-border" />
    </>
  );
}

/** A date input inside the menu, for a snooze none of the presets covers. */
function CustomSnoozeItem({ onPick }: { onPick: (date: Date) => void }) {
  return (
    <div className="px-2 py-1.5">
      <label className="beam-meta mb-1 block">Until</label>
      <input
        type="date"
        aria-label="Snooze until"
        className="h-7 w-full rounded-md border border-border bg-transparent px-2 text-[13px] outline-none focus:border-ring"
        onChange={(event) => {
          const date = new Date(`${event.target.value}T09:00:00`);
          if (!Number.isNaN(date.getTime())) onPick(date);
        }}
      />
    </div>
  );
}

/**
 * Accept while also setting the two properties that are valid for any
 * selection. Anything team-specific stays out: the default Accept path is the
 * fast one, and this is the small detour.
 */
function AcceptWithOverride({
  ctx,
  issues,
  onAccept,
}: {
  ctx: PropertyContext;
  issues: IssueListItem[];
  onAccept: (options: {
    assigneeId?: string | null;
    priority?: IssueListItem["priority"];
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState<"assignee" | "priority">("assignee");

  const def = PROPERTY_DEFS[field];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setField("assignee");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title={`Accept ${issues.length} issues and set a property`}
        >
          Accept with...
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        <div className="flex gap-0.5 border-b border-border p-1">
          {(["assignee", "priority"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              onClick={() => setField(entry)}
              className={
                field === entry
                  ? "h-6 flex-1 cursor-pointer rounded bg-accent text-[12px] font-medium"
                  : "h-6 flex-1 cursor-pointer rounded text-[12px] text-muted-foreground hover:bg-accent/60"
              }
            >
              {PROPERTY_DEFS[entry].label}
            </button>
          ))}
        </div>
        <PropertyOptionList
          options={def.options(ctx)}
          value={null}
          label={def.label}
          searchable={field === "assignee"}
          onPick={(value) => {
            setOpen(false);
            onAccept(
              field === "assignee"
                ? { assigneeId: value as string | null }
                : { priority: value as IssueListItem["priority"] },
            );
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

/** One lightweight confirmation, with the reason optional. */
function DeclineButton({
  count,
  onDecline,
}: {
  count: number;
  onDecline: (reason?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md px-2 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Decline
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <p className="mb-1.5 text-[13px]">
          Decline {count} {count === 1 ? "issue" : "issues"}? They move to
          canceled and stay in history.
        </p>
        <input
          autoFocus
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (optional)"
          aria-label="Decline reason"
          className="mb-2 h-7 w-full rounded-md border border-border bg-transparent px-2 text-[13px] outline-none focus:border-ring"
        />
        <div className="flex justify-end gap-1.5">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onDecline(reason);
            }}
            className="h-7 cursor-pointer rounded-md bg-destructive px-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            Decline
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
