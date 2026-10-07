/**
 * A route path cannot describe a project, so the project shell publishes the
 * loaded detail here and view-screen reads it alongside the URL state.
 */
export type PublishedProject = {
  id: string;
  name: string;
  status: string;
  health: string;
  lead: string | null;
  startDate: string | null;
  targetDate: string | null;
  progress: { completed: number; total: number; percent: number | null };
  milestones: { id: string; name: string }[];
};

let published: PublishedProject | null = null;

export function publishProjectContext(project: PublishedProject | null): void {
  published = project;
}

export function readProjectContext(
  projectId: string,
): PublishedProject | null {
  return published?.id === projectId ? published : null;
}
