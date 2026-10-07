import { useActionQuery } from "@agent-native/core/client/hooks";

import type { WorkspaceBootstrap } from "@/lib/types";

export function useWorkspace() {
  const query = useActionQuery<WorkspaceBootstrap | null>("get-workspace", {});
  return {
    workspace: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
  };
}

export function useTeamByKey(teamKey: string | undefined) {
  const { workspace, isLoading } = useWorkspace();
  const team = teamKey
    ? (workspace?.teams.find(
        (entry) => entry.key.toUpperCase() === teamKey.toUpperCase(),
      ) ?? null)
    : null;
  return { workspace, team, isLoading };
}
