/**
 * Numbers and dates are allocated by the server, so this asks for nothing that
 * Beam can work out for itself: an optional label, and dates only if the
 * defaults are wrong.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { SHORTCUT_PRIORITY, useShortcuts } from "@/hooks/use-shortcuts";
import { keys as shortcutKeys } from "@/lib/shortcuts";

const CREATE_CYCLE_EVENT = "beam:create-cycle";

export function openCreateCycle(teamId: string) {
  window.dispatchEvent(
    new CustomEvent(CREATE_CYCLE_EVENT, { detail: { teamId } }),
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-1 flex-col gap-1">
      <span className="beam-meta">{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 rounded-md border border-border bg-transparent px-2 text-[12px] outline-none"
      />
    </label>
  );
}

export function CreateCycleDialog() {
  const [open, setOpen] = useState(false);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [pending, setPending] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    function handle(event: Event) {
      const detail = (event as CustomEvent).detail as { teamId: string };
      setTeamId(detail.teamId);
      setName("");
      setStartsAt("");
      setEndsAt("");
      setOpen(true);
    }
    window.addEventListener(CREATE_CYCLE_EVENT, handle);
    return () => window.removeEventListener(CREATE_CYCLE_EVENT, handle);
  }, []);

  async function submit() {
    if (!teamId || pending) return;
    setPending(true);
    try {
      await callAction(
        "create-cycle",
        {
          teamId,
          name: name.trim() || undefined,
          startsAt: startsAt ? `${startsAt}T00:00:00.000Z` : undefined,
          endsAt: endsAt ? `${endsAt}T00:00:00.000Z` : undefined,
        },
        { method: "POST" },
      );
      void queryClient.invalidateQueries({ queryKey: ["action", "list-cycles"] });
      void queryClient.invalidateQueries({
        queryKey: ["action", "get-workspace"],
      });
      setOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not create that cycle.",
      );
    } finally {
      setPending(false);
    }
  }

  useShortcuts(
    {
      [shortcutKeys("edit.submit")]: () => {
        void submit();
        return true;
      },
    },
    { priority: SHORTCUT_PRIORITY.dialog, enabled: open, allowWhileTyping: true },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-md gap-0 p-0">
        <DialogTitle className="border-b border-border px-4 py-3 text-[13px] font-semibold">
          New cycle
        </DialogTitle>
        <DialogDescription className="sr-only">
          Create a cycle. The number and dates follow the team's cycle settings
          unless you override them.
        </DialogDescription>

        <div className="flex flex-col gap-3 p-4">
          <Input
            autoFocus
            value={name}
            placeholder="Optional name, e.g. Launch"
            onChange={(event) => setName(event.target.value)}
            className="h-9 border-0 px-0 text-[14px] shadow-none focus-visible:ring-0"
          />
          <div className="flex items-end gap-2">
            <DateField label="Starts" value={startsAt} onChange={setStartsAt} />
            <DateField label="Ends" value={endsAt} onChange={setEndsAt} />
          </div>
          <p className="beam-meta">
            Leave the dates empty to continue from the last cycle using the
            team's cycle length.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-7 cursor-pointer rounded-md px-2.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => void submit()}
            className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Create cycle
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
