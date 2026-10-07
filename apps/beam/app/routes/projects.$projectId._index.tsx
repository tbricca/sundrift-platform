import { useEffect, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router";

import { ProjectAnalyticsSection } from "@/components/analytics/ProjectAnalyticsSection";
import { MemberAvatar, formatRelative } from "@/components/issues/primitives";
import { ResourceSection } from "@/components/links/ResourceSection";
import { MilestoneList } from "@/components/projects/MilestoneList";
import type { ProjectDetail } from "@/components/projects/ProjectShell";
import { HealthLabel, ProgressBar } from "@/components/projects/primitives";
import { APP_TITLE } from "@/lib/app-config";

export function meta() {
  return [{ title: `Project overview — ${APP_TITLE}` }];
}

type Context = {
  project: ProjectDetail;
  refresh: () => void;
  patch: (input: Record<string, unknown>) => Promise<void>;
};

function Description({
  value,
  onSave,
}: {
  value: string | null;
  onSave: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);

  useEffect(() => setDraft(value ?? ""), [value]);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="w-full cursor-text rounded-md px-1 py-1 text-left text-[13px] leading-6 transition-colors hover:bg-muted/60"
      >
        {value ? (
          <span className="whitespace-pre-wrap">{value}</span>
        ) : (
          <span className="text-muted-foreground">
            Add a description for this project…
          </span>
        )}
      </button>
    );
  }

  return (
    <textarea
      autoFocus
      value={draft}
      rows={6}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== (value ?? "")) onSave(draft);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setDraft(value ?? "");
          setEditing(false);
        }
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.currentTarget.blur();
        }
      }}
      className="w-full resize-y rounded-md border border-border bg-background p-2 text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    />
  );
}

export default function ProjectOverviewRoute() {
  const { projectId = "" } = useParams();
  const { project, refresh, patch } = useOutletContext<Context>();
  const latest = project.updates[0] ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 p-4">
        <section>
          {project.summary ? (
            <p className="mb-2 text-[13px] text-muted-foreground">
              {project.summary}
            </p>
          ) : null}
          <Description
            value={project.description}
            onSave={(next) => void patch({ description: next || null })}
          />
        </section>

        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-border p-3">
          <div className="flex flex-col gap-1">
            <span className="beam-meta">Progress</span>
            <ProgressBar progress={project.progress} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="beam-meta">Health</span>
            <span className="text-[13px]">
              <HealthLabel health={project.health} />
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="beam-meta">Lead</span>
            <span className="flex items-center gap-1.5 text-[13px]">
              <MemberAvatar member={project.lead} size={18} />
              {project.lead?.name ?? "No lead"}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="beam-meta">Teams</span>
            <span className="text-[13px]">
              {project.teams.length
                ? project.teams.map((team) => team.key).join(", ")
                : "None"}
            </span>
          </div>
        </section>

        <ProjectAnalyticsSection projectId={projectId} />

        <ResourceSection
          entityType="project"
          entityId={projectId}
          className="mt-0"
        />

        <div className="rounded-lg border border-border">
          <MilestoneList
            projectId={projectId}
            milestones={project.milestones}
            onChanged={refresh}
          />
        </div>

        <section className="rounded-lg border border-border">
          <div className="flex h-8 items-center justify-between border-b border-border px-3">
            <h2 className="text-[12px] font-semibold">Latest update</h2>
            <Link
              to={`/projects/${projectId}/updates`}
              className="text-[12px] text-muted-foreground transition-colors hover:text-foreground"
            >
              All updates
            </Link>
          </div>
          {latest ? (
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2">
                <MemberAvatar member={latest.author} size={18} />
                <span className="text-[13px] font-medium">
                  {latest.author?.name ?? "Unknown"}
                </span>
                <span className="beam-chip">
                  <HealthLabel health={latest.health} />
                </span>
                <span className="beam-meta ms-auto">
                  {formatRelative(latest.createdAt ?? "")}
                </span>
              </div>
              <p className="mt-1.5 line-clamp-4 whitespace-pre-wrap text-[13px] leading-6">
                {latest.body}
              </p>
            </div>
          ) : (
            <p className="px-3 py-4 text-[13px] text-muted-foreground">
              No project updates yet.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
