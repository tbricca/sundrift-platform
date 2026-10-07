import { useOutletContext, useParams } from "react-router";

import type { ProjectDetail } from "@/components/projects/ProjectShell";
import {
  ProjectUpdateComposer,
  ProjectUpdateFeed,
} from "@/components/projects/ProjectUpdates";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Project updates — ${APP_TITLE}` }];
}

type Context = { project: ProjectDetail; refresh: () => void };

export default function ProjectUpdatesRoute() {
  const { projectId = "" } = useParams();
  const { project, refresh } = useOutletContext<Context>();

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl">
        <ProjectUpdateComposer
          projectId={projectId}
          currentHealth={project.health}
          onChanged={refresh}
        />
        <ProjectUpdateFeed updates={project.updates} onChanged={refresh} />
      </div>
    </div>
  );
}
