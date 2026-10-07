/**
 * Milestones are edited inline — no creation wizard. Progress is computed from
 * the issues pointing at each milestone and is never stored.
 */
import { callAction } from "@agent-native/core/client/hooks";
import {
  IconChevronDown,
  IconChevronUp,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import type { ProjectMilestone } from "./ProjectShell";
import { ProgressBar, formatProjectDate, isOverdue } from "./primitives";

type MilestonePatch = {
  milestoneId: string;
  name?: string;
  description?: string | null;
  targetDate?: string | null;
  sortOrder?: number;
  delete?: boolean;
};

async function mutateMilestone(input: MilestonePatch) {
  try {
    await callAction("update-milestone", input, { method: "PUT" });
    return true;
  } catch (error) {
    toast.error(
      error instanceof Error ? error.message : "Could not update that milestone.",
    );
    return false;
  }
}

function MilestoneRow({
  milestone,
  projectId,
  index,
  count,
  neighbours,
  onChanged,
}: {
  milestone: ProjectMilestone;
  projectId: string;
  index: number;
  count: number;
  neighbours: { previous?: ProjectMilestone; next?: ProjectMilestone };
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(milestone.name);
  const [description, setDescription] = useState(milestone.description ?? "");

  const overdue = isOverdue(
    milestone.targetDate,
    milestone.progress.percent === 100,
  );

  async function save() {
    setEditing(false);
    if (
      name.trim() === milestone.name &&
      description.trim() === (milestone.description ?? "")
    ) {
      return;
    }
    const ok = await mutateMilestone({
      milestoneId: milestone.id,
      name: name.trim() || milestone.name,
      description: description.trim() || null,
    });
    if (ok) onChanged();
  }

  /** Fractional reorder: drop between the two neighbours on the far side. */
  async function move(direction: -1 | 1) {
    const target = direction === -1 ? neighbours.previous : neighbours.next;
    if (!target) return;
    const swapped = await mutateMilestone({
      milestoneId: milestone.id,
      sortOrder: direction === -1 ? target.sortOrder - 1 : target.sortOrder + 1,
    });
    if (swapped) onChanged();
  }

  async function remove() {
    const ok = await mutateMilestone({
      milestoneId: milestone.id,
      delete: true,
    });
    if (ok) {
      toast(`Deleted “${milestone.name}”`);
      onChanged();
    }
  }

  return (
    <div className="group flex items-center gap-3 border-b border-border/70 px-3 py-2 text-[13px] transition-colors hover:bg-muted/50">
      <div className="flex flex-col">
        <button
          type="button"
          aria-label="Move milestone up"
          disabled={index === 0}
          onClick={() => void move(-1)}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-30"
        >
          <IconChevronUp className="size-3" />
        </button>
        <button
          type="button"
          aria-label="Move milestone down"
          disabled={index === count - 1}
          onClick={() => void move(1)}
          className="cursor-pointer text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default disabled:opacity-30"
        >
          <IconChevronDown className="size-3" />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {editing ? (
          <div className="flex flex-col gap-1.5">
            <Input
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
                if (event.key === "Escape") {
                  setName(milestone.name);
                  setDescription(milestone.description ?? "");
                  setEditing(false);
                }
              }}
              className="h-7 text-[13px]"
            />
            <Input
              value={description}
              placeholder="Description"
              onChange={(event) => setDescription(event.target.value)}
              onBlur={() => void save()}
              onKeyDown={(event) => {
                if (event.key === "Enter") void save();
              }}
              className="h-7 text-[12px]"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="block w-full cursor-text text-left"
          >
            <span className="font-medium">{milestone.name}</span>
            {milestone.description ? (
              <span className="beam-meta ms-2">{milestone.description}</span>
            ) : null}
          </button>
        )}
      </div>

      <ProgressBar progress={milestone.progress} className="shrink-0" />

      <label className="hidden shrink-0 cursor-pointer items-center rounded-md px-1.5 text-[12px] transition-colors hover:bg-accent sm:inline-flex">
        <span className={cn(overdue ? "text-destructive" : "text-muted-foreground")}>
          {milestone.targetDate ? formatProjectDate(milestone.targetDate) : "No date"}
        </span>
        <input
          type="date"
          value={milestone.targetDate ? milestone.targetDate.slice(0, 10) : ""}
          onChange={(event) => {
            void mutateMilestone({
              milestoneId: milestone.id,
              targetDate: event.target.value
                ? new Date(`${event.target.value}T12:00:00`).toISOString()
                : null,
            }).then((ok) => ok && onChanged());
          }}
          className="w-0 opacity-0"
        />
      </label>

      <Link
        to={`/projects/${projectId}/issues?milestone=${milestone.id}`}
        className="beam-chip shrink-0 transition-colors hover:bg-accent"
      >
        Issues
      </Link>

      <button
        type="button"
        aria-label={`Delete ${milestone.name}`}
        onClick={() => void remove()}
        className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-destructive group-hover:opacity-100"
      >
        <IconTrash className="size-3.5" />
      </button>
    </div>
  );
}

export function MilestoneList({
  projectId,
  milestones,
  onChanged,
}: {
  projectId: string;
  milestones: ProjectMilestone[];
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  async function create() {
    const trimmed = name.trim();
    setName("");
    setAdding(false);
    if (!trimmed) return;
    try {
      await callAction(
        "create-milestone",
        { projectId, name: trimmed },
        { method: "POST" },
      );
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add that milestone.",
      );
    }
  }

  return (
    <section>
      <div className="flex h-8 items-center justify-between border-b border-border px-3">
        <h2 className="text-[12px] font-semibold">Milestones</h2>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconPlus className="size-3" />
          Add
        </button>
      </div>

      {milestones.map((milestone, index) => (
        <MilestoneRow
          key={milestone.id}
          milestone={milestone}
          projectId={projectId}
          index={index}
          count={milestones.length}
          neighbours={{
            previous: milestones[index - 1],
            next: milestones[index + 1],
          }}
          onChanged={onChanged}
        />
      ))}

      {adding ? (
        <div className="border-b border-border/70 px-3 py-2">
          <Input
            autoFocus
            value={name}
            placeholder="Milestone name"
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void create()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void create();
              if (event.key === "Escape") {
                setName("");
                setAdding(false);
              }
            }}
            className="h-7 text-[13px]"
          />
        </div>
      ) : null}

      {milestones.length === 0 && !adding ? (
        <p className="px-3 py-4 text-[13px] text-muted-foreground">
          No milestones yet.
        </p>
      ) : null}
    </section>
  );
}
