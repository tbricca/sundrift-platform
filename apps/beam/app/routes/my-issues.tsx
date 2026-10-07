import { useMemo } from "react";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { useWorkspace } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { issueQuery, myIssuesQuery } from "@/lib/issue-query";

export function meta() {
  return [{ title: `My Issues — ${APP_TITLE}` }];
}

export default function MyIssuesRoute() {
  const { workspace, isLoading } = useWorkspace();
  const memberId = workspace?.currentMemberId ?? null;
  const me = workspace?.members.find((member) => member.id === memberId);

  // The identity can be a human or an agent; the query is the same either way.
  const baseQuery = useMemo(
    () => (memberId ? myIssuesQuery(memberId) : issueQuery()),
    [memberId],
  );

  if (!isLoading && !memberId) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        No current member is signed in.
      </div>
    );
  }

  return (
    <IssueViewSurface
      title="My Issues"
      accessory={
        me ? (
          <span className="beam-chip shrink-0">{me.name}</span>
        ) : null
      }
      baseQuery={baseQuery}
      context={{ type: "my-issues", id: memberId ?? undefined }}
      emptyMessage="Nothing assigned to you right now."
    />
  );
}
