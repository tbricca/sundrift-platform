import { useMemo } from "react";
import { useOutletContext, useParams } from "react-router";

import { IssueViewSurface } from "@/components/issues/IssueViewSurface";
import type { ProjectDetail } from "@/components/projects/ProjectShell";
import { useWorkspace } from "@/hooks/use-workspace";
import { APP_TITLE } from "@/lib/app-config";
import { projectQuery } from "@/lib/issue-query";

export function meta() {
  return [{ title: `Project issues — ${APP_TITLE}` }];
}

type Context = { project: ProjectDetail };

export default function ProjectIssuesRoute() {
  const { projectId = "" } = useParams();
  const { project } = useOutletContext<Context>();

  // The single project preset over the same engine every other surface uses.
  const baseQuery = useMemo(() => projectQuery(projectId), [projectId]);

  // A project can span teams; team-scoped pickers only make sense when it
  // participates in exactly one.
  const { workspace } = useWorkspace();
  const team =
    project.teams.length === 1
      ? (workspace?.teams.find((entry) => entry.id === project.teams[0].id) ??
        null)
      : null;

  return (
    <IssueViewSurface
      title={project.name}
      baseQuery={baseQuery}
      context={{ type: "project", id: projectId }}
      team={team}
      projectId={projectId}
      emptyMessage="No issues in this project yet."
    />
  );
}
