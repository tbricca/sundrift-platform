import { useActionQuery } from "@agent-native/core/client/hooks";

import type { Priority } from "@/lib/issue-query";

/** The shape `list-issue-templates` returns for one template. */
export type TemplateSummary = {
  id: string;
  teamId: string;
  name: string;
  description: string | null;
  titleTemplate: string | null;
  issueDescription: string | null;
  priority: Priority | null;
  statusId: string | null;
  assigneeId: string | null;
  projectId: string | null;
  cycleId: string | null;
  milestoneId: string | null;
  estimate: number | null;
  dueDateOffsetDays: number | null;
  labelIds: string[];
  archivedAt: string | null;
  createdAt: string;
  summary: string[];
};

export function useTemplates(
  teamId: string | undefined,
  options: { includeArchived?: boolean } = {},
) {
  const query = useActionQuery<{ templates: TemplateSummary[] }>(
    "list-issue-templates",
    { teamId, includeArchived: options.includeArchived },
    // A team with no templates is the normal case for most of the app; there
    // is nothing to fetch until a team is in scope.
    { enabled: Boolean(teamId) },
  );

  return {
    templates: query.data?.templates ?? [],
    isLoading: query.isLoading,
  };
}
