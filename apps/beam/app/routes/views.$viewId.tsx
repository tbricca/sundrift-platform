import { useMemo } from "react";
import { useParams } from "react-router";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import { useSavedViews } from "@/components/views/SavedViewList";
import { useWorkspace } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { issueQuery } from "@/lib/issue-query";
import { savedViewQuery } from "@/lib/view-url";

export function meta() {
  return [{ title: `View — ${APP_TITLE}` }];
}

export default function SavedViewRoute() {
  const { viewId = "" } = useParams();
  const { workspace } = useWorkspace();
  const { views, isLoading } = useSavedViews();

  const view = views.find((entry) => entry.id === viewId) ?? null;

  const baseQuery = useMemo(
    () => (view ? savedViewQuery(view.query) : issueQuery()),
    [view],
  );

  const team = view?.teamId
    ? (workspace?.teams.find((entry) => entry.id === view.teamId) ?? null)
    : null;

  if (!isLoading && !view) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        That view is no longer available.
      </div>
    );
  }

  return (
    <IssueViewSurface
      key={viewId}
      title={view?.name ?? "View"}
      baseQuery={baseQuery}
      context={{ type: "saved-view", id: viewId }}
      savedView={
        view
          ? {
              id: view.id,
              name: view.name,
              teamId: view.teamId,
              isShared: view.isShared,
              isOwn: view.isOwn,
            }
          : null
      }
      team={team}
      emptyMessage="No issues match this view."
    />
  );
}
