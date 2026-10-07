import { Outlet, useParams } from "react-router";

import {
  ProjectHeader,
  useProject,
} from "@/components/projects/ProjectShell";
import { Skeleton } from "@/components/ui/skeleton";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Project — ${APP_TITLE}` }];
}

export default function ProjectDetailRoute() {
  const { projectId = "" } = useParams();
  const { project, isLoading, refresh, patch } = useProject(projectId);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 p-4">
        <Skeleton className="h-8 w-64 rounded-md" />
        <Skeleton className="h-6 w-full rounded-md" />
        <Skeleton className="h-40 w-full rounded-md" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        That project is no longer available.
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <ProjectHeader project={project} patch={patch} refresh={refresh} />
      <div className="min-h-0 flex-1 overflow-hidden">
        <Outlet context={{ project, refresh, patch }} />
      </div>
    </div>
  );
}
