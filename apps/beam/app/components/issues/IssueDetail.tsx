import {
  callAction,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconArchive,
  IconArrowLeft,
  IconBell,
  IconBellFilled,
  IconDots,
  IconLink,
  IconPlus,
  IconSubtask,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useIssueMutations } from "@/hooks/use-issue-mutations";
import { useWorkspace } from "@/hooks/use-workspace";
import { reconcileEditableText } from "@/lib/realtime-events";
import type {
  IssueDetail as IssueDetailData,
  RelationEntry,
} from "@/lib/types";
import { cn } from "@/lib/utils";

import { IssueDetailMenu } from "@/components/menus/IssueDetailMenu";

import { ResourceSection } from "../links/ResourceSection";
import { ActivityFeed } from "./ActivityFeed";
import { CommentThread } from "./CommentThread";
import { IssueSearchPicker } from "./IssueSearchPicker";
import { MentionText } from "./MentionText";
import { MentionTextarea } from "./MentionTextarea";
import {
  DETAIL_PROPERTY_ORDER,
  IssueProperty,
  PROPERTY_DEFS,
  type PropertyContext,
} from "./properties";
import {
  MemberAvatar,
  StatusIcon,
  formatRelative,
  formatShortDate,
} from "./primitives";

const RELATION_LABEL: Record<RelationEntry["type"], string> = {
  blocks: "Blocks",
  blocked_by: "Blocked by",
  related: "Related",
  duplicate: "Duplicate of",
};

const RELATION_TYPES: RelationEntry["type"][] = [
  "blocks",
  "blocked_by",
  "related",
  "duplicate",
];

export function IssueDetail({
  identifier,
  variant,
  onClose,
}: {
  identifier: string;
  variant: "page" | "overlay";
  onClose?: () => void;
}) {
  const { workspace } = useWorkspace();
  const navigate = useNavigate();
  const { updateProperty, deleteIssue, invalidateIssues } = useIssueMutations();

  const { data: issue, isLoading } = useActionQuery<IssueDetailData | null>(
    "get-issue",
    { identifier },
  );

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [editingDescription, setEditingDescription] = useState(false);

  const [staleText, setStaleText] = useState(false);

  // The last server values these fields were reconciled against. Comparing
  // against them is how we tell "the user typed" from "nothing has happened".
  const serverText = useRef({ title: "", description: "" });

  useEffect(() => {
    if (!issue) return;
    setTitle(issue.title);
    setDescription(issue.description ?? "");
    setEditingDescription(false);
    setStaleText(false);
    serverText.current = {
      title: issue.title,
      description: issue.description ?? "",
    };
  }, [issue?.id]);

  /**
   * Someone else edited this issue while it was open. Properties re-render
   * themselves from the refetched query; text is different, because the user
   * may be part-way through a sentence. Unsaved local text always wins and the
   * pane shows a quiet notice instead — Beam does not merge prose.
   */
  useEffect(() => {
    if (!issue) return;
    const previous = serverText.current;
    const nextTitle = issue.title;
    const nextDescription = issue.description ?? "";
    if (
      previous.title === nextTitle &&
      previous.description === nextDescription
    ) {
      return;
    }

    const titleResult = reconcileEditableText(title, previous.title, nextTitle);
    const descriptionResult = reconcileEditableText(
      description,
      previous.description,
      nextDescription,
    );

    setTitle(titleResult.value);
    if (!editingDescription) setDescription(descriptionResult.value);
    setStaleText(
      titleResult.stale || (editingDescription && descriptionResult.stale),
    );
    serverText.current = { title: nextTitle, description: nextDescription };
  }, [issue?.title, issue?.description]);

  const team = useMemo(
    () => workspace?.teams.find((entry) => entry.id === issue?.team.id) ?? null,
    [workspace, issue?.team.id],
  );

  const ctx: PropertyContext = useMemo(
    () => ({ workspace, team, projectId: issue?.project?.id ?? null }),
    [workspace, team, issue?.project?.id],
  );

  const updateIssue = useActionMutation("update-issue", { method: "PUT" });

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 p-6">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }

  if (!issue) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center text-sm text-muted-foreground">
        {identifier} is no longer available. It may have been deleted in another
        session.
      </div>
    );
  }

  /** Detail-only: the parent link lives on this view, not in the catalog. */
  function removeParent() {
    if (!issue) return;
    updateIssue.mutate(
      { identifier: issue.identifier, parentIssueId: null },
      { onSuccess: () => invalidateIssues() },
    );
  }

  /** Where to land once the issue is gone. */
  function afterDelete() {
    if (variant === "overlay") onClose?.();
    else if (issue) navigate("/team/" + issue.team.key + "/issues");
  }

  function commitText(field: "title" | "description", value: string) {
    if (!issue) return;
    const current = field === "title" ? issue.title : (issue.description ?? "");
    if (value === current) return;
    if (field === "title" && !value.trim()) {
      setTitle(issue.title);
      return;
    }
    updateIssue.mutate(
      { identifier: issue.identifier, [field]: value },
      {
        onError: (error) => {
          if (field === "title") setTitle(issue.title);
          else setDescription(issue.description ?? "");
          toast.error(error.message);
        },
      },
    );
  }

  async function toggleSubscription() {
    if (!issue) return;
    try {
      await callAction(
        "update-issue-subscription",
        { identifier: issue.identifier, subscribed: !issue.subscribed },
        { method: "PUT" },
      );
      invalidateIssues();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not change your subscription.",
      );
    }
  }

  async function setRelation(
    relatedIdentifier: string,
    type: RelationEntry["type"],
    remove = false,
  ) {
    if (!issue) return;
    try {
      await callAction("update-issue-relation", {
        identifier: issue.identifier,
        relatedIdentifier,
        type,
        remove,
      });
      invalidateIssues();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not update the relation.",
      );
    }
  }

  const progress = issue.subIssueProgress;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
        {variant === "page" ? (
          <Link
            to={`/team/${issue.team.key}/issues`}
            aria-label={`Back to ${issue.team.name} issues`}
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconArrowLeft className="size-4" />
          </Link>
        ) : null}
        <span className="beam-meta">{issue.team.name}</span>
        <span className="text-muted-foreground">/</span>
        <span className="beam-meta">{issue.identifier}</span>

        <div className="ms-auto flex items-center gap-1">
          {variant === "overlay" ? (
            <Link
              to={`/issue/${issue.identifier}`}
              aria-label="Open full page"
              className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <IconLink className="size-3.5" />
            </Link>
          ) : null}
          <button
            type="button"
            onClick={() => void toggleSubscription()}
            aria-pressed={issue.subscribed}
            aria-label={
              issue.subscribed
                ? "Unsubscribe from this issue"
                : "Subscribe to this issue"
            }
            title={
              issue.subscribed
                ? "Subscribed — you get comment notifications"
                : "Subscribe to comment notifications"
            }
            className={cn(
              "inline-flex size-6 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-accent hover:text-foreground",
              issue.subscribed ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {issue.subscribed ? (
              <IconBellFilled className="size-3.5" />
            ) : (
              <IconBell className="size-3.5" />
            )}
          </button>
          <IssueDetailMenu
            issue={issue}
            ctx={ctx}
            onRemoveParent={removeParent}
            onDelete={afterDelete}
          />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close issue"
              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <IconX className="size-4" />
            </button>
          ) : null}
        </div>
      </header>

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-y-auto",
          variant === "page" && "lg:flex-row lg:overflow-hidden",
        )}
      >
        <div
          className={cn(
            "min-w-0 flex-1",
            variant === "page" && "lg:overflow-y-auto",
          )}
        >
          <div
            className={cn(
              "px-5 py-5",
              variant === "page" && "mx-auto max-w-3xl px-6 py-6",
            )}
          >
            {issue.parent ? (
              <Link
                to={`/issue/${issue.parent.identifier}`}
                className="mb-3 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                <IconSubtask className="size-3.5" />
                {issue.parent.identifier} · {issue.parent.title}
              </Link>
            ) : null}

            {issue.archivedAt ? (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1">
                <IconArchive className="size-3.5 text-muted-foreground" />
                <span className="beam-meta">
                  Archived {formatRelative(issue.archivedAt)}. Still fully
                  readable.
                </span>
                <button
                  type="button"
                  onClick={() =>
                    updateIssue.mutate(
                      { identifier: issue.identifier, archived: false },
                      {
                        onSuccess: () => {
                          invalidateIssues();
                          toast("Issue unarchived");
                        },
                        onError: (error) => toast.error(error.message),
                      },
                    )
                  }
                  className="ms-auto cursor-pointer text-[11px] font-medium text-primary hover:underline"
                >
                  Unarchive
                </button>
              </div>
            ) : null}

            {staleText ? (
              <div className="mb-2 flex items-center gap-2 rounded-md border border-border bg-muted/50 px-2 py-1">
                <span className="beam-meta">
                  Someone else edited this issue. Your unsaved text was kept.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setTitle(issue.title);
                    setDescription(issue.description ?? "");
                    setStaleText(false);
                  }}
                  className="ms-auto cursor-pointer text-[11px] font-medium text-primary hover:underline"
                >
                  Use theirs
                </button>
              </div>
            ) : null}

            <textarea
              value={title}
              rows={1}
              aria-label="Issue title"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => commitText("title", title.trim())}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  event.stopPropagation();
                  setTitle(issue.title);
                  event.currentTarget.blur();
                }
              }}
              className="w-full resize-none overflow-hidden bg-transparent text-[20px] font-semibold leading-7 tracking-[-0.01em] outline-none"
            />

            {editingDescription ? (
              <MentionTextarea
                value={description}
                onChange={setDescription}
                members={workspace?.members ?? []}
                autoFocus
                ariaLabel="Issue description"
                placeholder="Add a description… use @ to mention someone"
                className="mt-2 min-h-[120px] rounded-md border border-border p-2"
                onSubmit={() => {
                  commitText("description", description);
                  setEditingDescription(false);
                }}
                onCancel={() => {
                  setDescription(issue.description ?? "");
                  setEditingDescription(false);
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingDescription(true)}
                className="mt-2 block w-full cursor-text rounded-md px-1 py-1 text-left text-[13px] leading-6 transition-colors hover:bg-muted/50"
              >
                {issue.description ? (
                  <MentionText
                    text={issue.description}
                    members={workspace?.members ?? []}
                  />
                ) : (
                  <span className="text-muted-foreground">
                    Add a description…
                  </span>
                )}
              </button>
            )}

            <SubIssueSection
              issue={issue}
              progress={progress}
              onChanged={invalidateIssues}
            />

            <RelationSection issue={issue} onChange={setRelation} />

            <ResourceSection entityType="issue" entityId={issue.id} />

            <section className="mt-7">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Comments
              </h2>
              <CommentThread issue={issue} />
            </section>

            <section className="mt-7 pb-10">
              <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Activity
              </h2>
              <ActivityFeed activity={issue.activity} />
            </section>
          </div>
        </div>

        <aside
          className={cn(
            "shrink-0 border-t border-border px-3 py-3",
            variant === "page"
              ? "lg:w-64 lg:overflow-y-auto lg:border-s lg:border-t-0"
              : "",
          )}
        >
          <div
            className={cn(
              variant === "overlay" && "grid gap-x-4 sm:grid-cols-2",
            )}
          >
            {DETAIL_PROPERTY_ORDER.map((property) => {
              const def = PROPERTY_DEFS[property];
              return (
                <div
                  key={property}
                  className="group/rail flex min-h-8 items-center gap-2"
                >
                  <span className="w-[74px] shrink-0 text-[12px] text-muted-foreground">
                    {def.label}
                  </span>
                  <IssueProperty
                    property={property}
                    value={def.read(issue)}
                    ctx={ctx}
                    variant="rail"
                    onChange={(value) =>
                      void updateProperty(issue, property, value, ctx)
                    }
                  />
                </div>
              );
            })}
          </div>

          <p className="mt-3 border-t border-border pt-3 text-[11px] leading-5 text-muted-foreground">
            {issue.createdBy ? `Opened by ${issue.createdBy.name}` : "Opened"} ·{" "}
            {formatShortDate(issue.createdAt)}
          </p>
        </aside>
      </div>
    </div>
  );
}

function SubIssueSection({
  issue,
  progress,
  onChanged,
}: {
  issue: IssueDetailData;
  progress: IssueDetailData["subIssueProgress"];
  onChanged: () => void;
}) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const createIssue = useActionMutation<{ identifier: string }>("create-issue");
  const updateIssue = useActionMutation("update-issue", { method: "PUT" });

  function submit() {
    if (!title.trim()) return;
    createIssue.mutate(
      { title: title.trim(), parentIssueId: issue.id },
      {
        onSuccess: () => {
          setTitle("");
          setCreating(false);
          onChanged();
        },
        onError: (error) => toast.error(error.message),
      },
    );
  }

  const excludeIds = [
    issue.id,
    ...issue.ancestorIds,
    ...issue.subIssues.map((child) => child.id),
  ];

  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Sub-issues
        </h2>
        {progress ? (
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-16 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full bg-primary transition-[width]"
                style={{
                  width: `${Math.round((progress.completed / progress.total) * 100)}%`,
                }}
              />
            </span>
            <span className="beam-meta">
              {progress.completed}/{progress.total}
            </span>
          </span>
        ) : null}
        <div className="ms-auto flex items-center gap-1">
          <IssueSearchPicker
            teamId={issue.team.id}
            excludeIds={excludeIds}
            onSelect={(child) =>
              updateIssue.mutate(
                { identifier: child.identifier, parentIssueId: issue.id },
                {
                  onSuccess: onChanged,
                  onError: (error) => toast.error(error.message),
                },
              )
            }
            placeholder="Attach an existing issue…"
            trigger={
              <button
                type="button"
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <IconLink className="size-3.5" />
                Attach
              </button>
            }
          />
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <IconPlus className="size-3.5" />
            Add
          </button>
        </div>
      </div>

      {issue.subIssues.length || creating ? (
        <div className="overflow-hidden rounded-md border border-border">
          {issue.subIssues.map((child) => (
            <Link
              key={child.id}
              to={`/issue/${child.identifier}`}
              className="beam-row last:border-b-0"
            >
              <StatusIcon status={child.status} />
              <span className="beam-meta w-[62px] shrink-0">
                {child.identifier}
              </span>
              <span className="min-w-0 flex-1 truncate">{child.title}</span>
              <MemberAvatar member={child.assignee} size={18} />
            </Link>
          ))}
          {creating ? (
            <div className="flex h-9 items-center gap-2 px-3">
              <input
                autoFocus
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit();
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    setCreating(false);
                    setTitle("");
                  }
                }}
                onBlur={() => {
                  if (!title.trim()) setCreating(false);
                }}
                placeholder="Sub-issue title, then Enter"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted-foreground"
              />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No sub-issues yet.</p>
      )}
    </section>
  );
}

function RelationSection({
  issue,
  onChange,
}: {
  issue: IssueDetailData;
  onChange: (
    relatedIdentifier: string,
    type: RelationEntry["type"],
    remove?: boolean,
  ) => void;
}) {
  const [pendingType, setPendingType] =
    useState<RelationEntry["type"]>("blocks");
  const excludeIds = [issue.id, ...issue.relations.map((rel) => rel.issue.id)];

  return (
    <section className="mt-7">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Relations
        </h2>
        <div className="ms-auto flex items-center gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              {RELATION_LABEL[pendingType]}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Relation type
              </DropdownMenuLabel>
              {RELATION_TYPES.map((type) => (
                <DropdownMenuItem
                  key={type}
                  className="text-[13px]"
                  onSelect={() => setPendingType(type)}
                >
                  {RELATION_LABEL[type]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <IssueSearchPicker
            excludeIds={excludeIds}
            onSelect={(related) => onChange(related.identifier, pendingType)}
            placeholder="Link an issue…"
            trigger={
              <button
                type="button"
                className="inline-flex h-6 cursor-pointer items-center gap-1 rounded-md px-1.5 text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <IconPlus className="size-3.5" />
                Link
              </button>
            }
          />
        </div>
      </div>

      {issue.relations.length ? (
        <div className="flex flex-col gap-1">
          {issue.relations.map((relation) => (
            <div
              key={relation.id}
              className="group/relation flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-[13px] transition-colors hover:bg-muted/50"
            >
              <span className="beam-meta w-[72px] shrink-0">
                {RELATION_LABEL[relation.type]}
              </span>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: relation.issue.statusColor }}
              />
              <Link
                to={`/issue/${relation.issue.identifier}`}
                className="flex min-w-0 flex-1 items-center gap-2 hover:underline"
              >
                <span className="beam-meta">{relation.issue.identifier}</span>
                <span className="min-w-0 truncate">{relation.issue.title}</span>
              </Link>
              <button
                type="button"
                aria-label="Remove relation"
                onClick={() =>
                  onChange(relation.issue.identifier, relation.type, true)
                }
                className="inline-flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/relation:opacity-100"
              >
                <IconX className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-muted-foreground">No linked issues.</p>
      )}
    </section>
  );
}
