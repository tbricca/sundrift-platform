import { ProjectList } from "@/components/projects/ProjectList";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Projects — ${APP_TITLE}` }];
}

export default function ProjectsRoute() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-4">
        <h1 className="text-[13px] font-semibold">Projects</h1>
        <span className="beam-meta">Cross-team planning</span>
      </header>
      <ProjectList emptyMessage="No projects yet. Create one to group issues across teams." />
    </div>
  );
}
