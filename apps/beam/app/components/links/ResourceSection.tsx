/**
 * Resource links on an issue or a project.
 *
 * One component for both: the entity type is a prop, the actions are
 * polymorphic, and nothing here knows which surface it is rendered on. A
 * project-specific copy would be a second thing to keep in step for no gain.
 */
import { callAction, useActionQuery } from "@agent-native/core/client/hooks";
import { IconExternalLink, IconPlus, IconX } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { linkMenuModel } from "@/components/command/command-menu";
import { EntityContextMenu } from "@/components/menus/EntityContextMenu";
import { copyText } from "@/hooks/use-command-runner";
import {
  faviconUrl,
  hostnameOf,
  linkDisplayTitle,
  normalizeUrl,
} from "@/lib/entity-links";
import { invalidateLinks } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export type ResourceLink = {
  id: string;
  url: string;
  title: string | null;
};

type Props = {
  entityType: "issue" | "project";
  entityId: string;
  className?: string;
};

export function ResourceSection({ entityType, entityId, className }: Props) {
  const queryClient = useQueryClient();
  const { data } = useActionQuery<{ links: ResourceLink[] }>(
    "list-entity-links",
    { entityType, entityId },
  );
  const links = data?.links ?? [];
  const [renaming, setRenaming] = useState<string | null>(null);

  const refresh = () => invalidateLinks(queryClient, entityType);

  async function add(url: string, title: string | null) {
    try {
      await callAction("create-entity-link", {
        entityType,
        entityId,
        url,
        title,
      });
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not add that link.",
      );
    }
  }

  async function rename(id: string, title: string) {
    setRenaming(null);
    await callAction(
      "update-entity-link",
      { id, title: title.trim() || null },
      { method: "PUT" },
    );
    refresh();
  }

  async function remove(id: string) {
    await callAction("delete-entity-link", { id }, { method: "DELETE" });
    refresh();
  }

  return (
    <section className={cn("mt-7", className)}>
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Resources
        </h2>
        <div className="ms-auto">
          <AddLinkPopover onAdd={add} />
        </div>
      </div>

      {links.length ? (
        <div className="flex flex-col gap-1">
          {links.map((link) => (
            <EntityContextMenu
              key={link.id}
              sections={linkMenuModel()}
              header={linkDisplayTitle(link)}
              onSelect={(id) => {
                if (id === "open") window.open(link.url, "_blank", "noopener");
                if (id === "copy-link-url") void copyText(link.url, "URL");
                if (id === "link-rename") setRenaming(link.id);
                if (id === "link-delete") void remove(link.id);
              }}
            >
            <div className="group/link flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted/50">
              <Favicon url={link.url} />
              {renaming === link.id ? (
                <input
                  autoFocus
                  defaultValue={link.title ?? ""}
                  placeholder={hostnameOf(link.url)}
                  aria-label="Link title"
                  className="min-w-0 flex-1 bg-transparent outline-none"
                  onBlur={(event) => void rename(link.id, event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
                >
                  <span className="min-w-0 truncate">
                    {linkDisplayTitle(link)}
                  </span>
                  <span className="beam-meta shrink-0">
                    {hostnameOf(link.url)}
                  </span>
                  <IconExternalLink className="size-3 shrink-0 text-muted-foreground" />
                </a>
              )}
              <button
                type="button"
                onClick={() => setRenaming(link.id)}
                className="shrink-0 cursor-pointer rounded px-1 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/link:opacity-100"
              >
                Rename
              </button>
              <button
                type="button"
                aria-label="Remove link"
                onClick={() => void remove(link.id)}
                className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/link:opacity-100"
              >
                <IconX className="size-3.5" />
              </button>
            </div>
            </EntityContextMenu>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">
          No links yet. Add a spec, design or dashboard.
        </p>
      )}
    </section>
  );
}

/** Favicons are third-party and often missing; a dot is the quiet fallback. */
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  const src = faviconUrl(url);

  if (!src || failed) {
    return <span className="size-3.5 shrink-0 rounded-sm bg-muted" />;
  }
  return (
    <img
      src={src}
      alt=""
      width={14}
      height={14}
      className="size-3.5 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
    />
  );
}

function AddLinkPopover({
  onAdd,
}: {
  onAdd: (url: string, title: string | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setUrl("");
      setTitle("");
    }
  }, [open]);

  const normalized = normalizeUrl(url);
  const invalid = url.trim().length > 0 && !normalized;

  async function submit() {
    if (!normalized) return;
    setOpen(false);
    await onAdd(normalized.url, title.trim() || null);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <IconPlus className="size-3.5" />
          Add link
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          className="flex flex-col gap-1.5"
        >
          <input
            ref={urlRef}
            autoFocus
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
            aria-label="Link URL"
            className="h-7 rounded-md border border-border bg-transparent px-2 text-[13px] outline-none focus:border-ring"
          />
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={
              normalized ? hostnameOf(normalized.url) : "Title (optional)"
            }
            aria-label="Link title"
            className="h-7 rounded-md border border-border bg-transparent px-2 text-[13px] outline-none focus:border-ring"
          />
          <div className="flex items-center gap-2">
            <span className="beam-meta flex-1">
              {invalid ? "Enter an http or https link." : ""}
            </span>
            <button
              type="submit"
              disabled={!normalized}
              className="h-7 cursor-pointer rounded-md bg-primary px-2 text-[12px] font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
