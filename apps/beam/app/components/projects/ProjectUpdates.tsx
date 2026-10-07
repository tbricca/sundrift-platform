/**
 * Project updates are the project's human-readable history. Posting one also
 * sets the project's current health, so the header never disagrees with the
 * most recent thing someone wrote.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { IconPencil, IconTrash } from "@tabler/icons-react";
import { useState } from "react";
import { toast } from "sonner";

import { MemberAvatar, formatRelative } from "@/components/issues/primitives";
import { PropertyOptionList } from "@/components/issues/properties";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { ProjectUpdate } from "./ProjectShell";
import {
  HealthLabel,
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_ORDER,
  type ProjectHealth,
} from "./primitives";

function HealthPicker({
  health,
  onPick,
}: {
  health: ProjectHealth;
  onPick: (health: ProjectHealth) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger
        aria-label="Update health"
        className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2 text-[12px] transition-colors hover:bg-accent"
      >
        <HealthLabel health={health} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-0">
        <PropertyOptionList
          label="health"
          value={health}
          options={PROJECT_HEALTH_ORDER.map((entry) => ({
            value: entry,
            label: PROJECT_HEALTH_LABEL[entry],
          }))}
          onPick={(value) => onPick(value as ProjectHealth)}
        />
      </PopoverContent>
    </Popover>
  );
}

function UpdateRow({
  update,
  onChanged,
}: {
  update: ProjectUpdate;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(update.body);
  const [health, setHealth] = useState<ProjectHealth>(update.health);

  async function save() {
    setEditing(false);
    if (body.trim() === update.body && health === update.health) return;
    try {
      await callAction(
        "update-project-update",
        { updateId: update.id, body: body.trim(), health },
        { method: "PUT" },
      );
      onChanged();
    } catch (error) {
      setBody(update.body);
      toast.error(
        error instanceof Error ? error.message : "Could not save that update.",
      );
    }
  }

  async function remove() {
    try {
      await callAction(
        "update-project-update",
        { updateId: update.id, delete: true },
        { method: "PUT" },
      );
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not delete that update.",
      );
    }
  }

  return (
    <article className="group border-b border-border/70 px-4 py-3">
      <div className="flex items-center gap-2">
        <MemberAvatar member={update.author} size={20} />
        <span className="text-[13px] font-medium">
          {update.author?.name ?? "Unknown"}
        </span>
        {update.author?.kind === "agent" ? (
          <span className="beam-chip">Agent</span>
        ) : null}
        <span className="beam-chip">
          <HealthLabel health={update.health} />
        </span>
        <span className="beam-meta ms-auto">
          {formatRelative(update.createdAt ?? "")}
        </span>

        {update.isOwn ? (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              type="button"
              aria-label="Edit update"
              onClick={() => setEditing(true)}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <IconPencil className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Delete update"
              onClick={() => void remove()}
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-destructive"
            >
              <IconTrash className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <HealthPicker health={health} onPick={setHealth} />
          <textarea
            autoFocus
            value={body}
            rows={3}
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setBody(update.body);
                setHealth(update.health);
                setEditing(false);
              }
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                void save();
              }
            }}
            className="w-full resize-y rounded-md border border-border bg-background p-2 text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setBody(update.body);
                setEditing(false);
              }}
              className="h-7 cursor-pointer rounded-md px-2 text-[12px] text-muted-foreground hover:bg-accent"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void save()}
              className="h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-6 text-foreground">
          {update.body}
        </p>
      )}
    </article>
  );
}

export function ProjectUpdateComposer({
  projectId,
  currentHealth,
  onChanged,
}: {
  projectId: string;
  currentHealth: ProjectHealth;
  onChanged: () => void;
}) {
  const [health, setHealth] = useState<ProjectHealth>(
    currentHealth === "no_update" ? "on_track" : currentHealth,
  );
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);

  async function submit() {
    if (!body.trim() || pending) return;
    setPending(true);
    try {
      await callAction(
        "create-project-update",
        { projectId, health, body: body.trim() },
        { method: "POST" },
      );
      setBody("");
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not post that update.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-center gap-2">
        <HealthPicker health={health} onPick={setHealth} />
        <span className="beam-meta">
          Posting an update sets the project health
        </span>
      </div>
      <textarea
        value={body}
        rows={3}
        placeholder="What changed since the last update?"
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            void submit();
          }
        }}
        className="mt-2 w-full resize-y rounded-md border border-border bg-background p-2 text-[13px] leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="mt-2 flex justify-end">
        <button
          type="button"
          disabled={!body.trim() || pending}
          onClick={() => void submit()}
          className={cn(
            "h-7 cursor-pointer rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          Post update
        </button>
      </div>
    </div>
  );
}

export function ProjectUpdateFeed({
  updates,
  onChanged,
}: {
  updates: ProjectUpdate[];
  onChanged: () => void;
}) {
  if (updates.length === 0) {
    return (
      <p className="p-6 text-[13px] text-muted-foreground">
        No project updates yet.
      </p>
    );
  }
  return (
    <div>
      {updates.map((update) => (
        <UpdateRow key={update.id} update={update} onChanged={onChanged} />
      ))}
    </div>
  );
}
