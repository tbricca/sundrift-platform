/**
 * Two fields, so the settings are a popover on the queue rather than a page.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { IconSettings } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { WorkspaceTeam } from "@/components/issues/properties";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { useWorkspace } from "@/hooks/use-workspace";

export function useTriageSettings(teamId: string | undefined) {
  const queryClient = useQueryClient();

  return async function save(patch: {
    triageEnabled?: boolean;
    defaultTriageAssigneeId?: string | null;
  }) {
    if (!teamId) return;
    try {
      await callAction(
        "update-team-triage-settings",
        { teamId, ...patch },
        { method: "PUT" },
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that setting.",
      );
    } finally {
      void queryClient.invalidateQueries({
        queryKey: ["action", "get-workspace"],
      });
    }
  };
}

export function TriageSettingsMenu({ team }: { team: WorkspaceTeam | null }) {
  const { workspace } = useWorkspace();
  const save = useTriageSettings(team?.id);

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Triage settings"
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <IconSettings className="size-3.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <p className="border-b border-border px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Triage settings
        </p>

        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-[13px]">Triage enabled</span>
            <span className="beam-meta block">
              Incoming issues wait for review.
            </span>
          </span>
          <Switch
            checked={Boolean(team?.triageEnabled)}
            onCheckedChange={(value) => void save({ triageEnabled: value })}
          />
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="text-[13px]">Default assignee</span>
          <select
            aria-label="Default triage assignee"
            value={team?.defaultTriageAssigneeId ?? ""}
            onChange={(event) =>
              void save({
                defaultTriageAssigneeId: event.target.value || null,
              })
            }
            className="h-7 max-w-[130px] cursor-pointer rounded-md border border-border bg-transparent px-1.5 text-[12px] outline-none"
          >
            <option value="">None</option>
            {(workspace?.members ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </div>
      </PopoverContent>
    </Popover>
  );
}
