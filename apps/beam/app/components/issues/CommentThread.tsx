import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspace } from "@/hooks/use-workspace";
import { parseMentionIds } from "@/lib/mentions";
import type { CommentEntry, IssueDetail } from "@/lib/types";

import { MentionText } from "./MentionText";
import { MentionTextarea } from "./MentionTextarea";
import { MemberAvatar, formatRelative } from "./primitives";

export function CommentThread({ issue }: { issue: IssueDetail }) {
  const { workspace } = useWorkspace();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pending, setPending] = useState(false);

  const members = workspace?.members ?? [];
  const currentMemberId = workspace?.currentMemberId ?? null;

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ["action", "get-issue"] });
  }

  /** Optimistically appends the comment so the thread never feels laggy. */
  async function submit() {
    const body = draft.trim();
    if (!body || pending) return;

    const author = members.find((member) => member.id === currentMemberId);
    const optimistic: CommentEntry = {
      id: `optimistic-${Date.now()}`,
      body,
      mentions: parseMentionIds(body),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      author: author ?? null,
    };

    const snapshot = queryClient.getQueriesData({
      queryKey: ["action", "get-issue"],
    });
    queryClient.setQueriesData<unknown>(
      { queryKey: ["action", "get-issue"] },
      (data: unknown) => {
        const detail = data as IssueDetail | null;
        if (!detail || detail.id !== issue.id) return data;
        return { ...detail, comments: [...detail.comments, optimistic] };
      },
    );
    setDraft("");
    setPending(true);

    try {
      await callAction("create-comment", { identifier: issue.identifier, body });
      refresh();
    } catch (error) {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      setDraft(body);
      toast.error(
        error instanceof Error ? error.message : "Could not post that comment.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveEdit(comment: CommentEntry) {
    const body = editDraft.trim();
    if (!body) return;
    setEditingId(null);
    try {
      await callAction(
        "update-comment",
        { commentId: comment.id, body },
        { method: "PUT" },
      );
      refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not save that comment.",
      );
    }
  }

  async function remove(comment: CommentEntry) {
    const snapshot = queryClient.getQueriesData({
      queryKey: ["action", "get-issue"],
    });
    queryClient.setQueriesData<unknown>(
      { queryKey: ["action", "get-issue"] },
      (data: unknown) => {
        const detail = data as IssueDetail | null;
        if (!detail || detail.id !== issue.id) return data;
        return {
          ...detail,
          comments: detail.comments.filter((entry) => entry.id !== comment.id),
        };
      },
    );
    try {
      await callAction(
        "update-comment",
        { commentId: comment.id, delete: true },
        { method: "PUT" },
      );
      refresh();
    } catch (error) {
      for (const [key, data] of snapshot) queryClient.setQueryData(key, data);
      toast.error(
        error instanceof Error ? error.message : "Could not delete that comment.",
      );
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {issue.comments.map((comment) => {
        const isOwn = comment.author?.id === currentMemberId;
        const isEditing = editingId === comment.id;
        return (
          <article key={comment.id} className="group/comment flex gap-2.5">
            <MemberAvatar member={comment.author} size={24} />
            <div className="min-w-0 flex-1">
              <p className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold">
                  {comment.author?.name ?? "Unknown"}
                </span>
                <span className="beam-meta">
                  {formatRelative(comment.createdAt)}
                  {comment.updatedAt !== comment.createdAt ? " · edited" : ""}
                </span>
                {isOwn && !isEditing ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label="Comment actions"
                      className="ms-auto cursor-pointer rounded px-1 text-[12px] text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover/comment:opacity-100"
                    >
                      •••
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-32">
                      <DropdownMenuItem
                        className="text-[13px]"
                        onSelect={() => {
                          setEditingId(comment.id);
                          setEditDraft(comment.body);
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="text-[13px] text-destructive"
                        onSelect={() => void remove(comment)}
                      >
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </p>

              {isEditing ? (
                <div className="mt-1 rounded-md border border-border p-2">
                  <MentionTextarea
                    value={editDraft}
                    onChange={setEditDraft}
                    members={members}
                    autoFocus
                    ariaLabel="Edit comment"
                    className="min-h-[56px]"
                    onSubmit={() => void saveEdit(comment)}
                    onCancel={() => setEditingId(null)}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="h-6 cursor-pointer rounded px-2 text-[12px] text-muted-foreground hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void saveEdit(comment)}
                      className="h-6 cursor-pointer rounded-md bg-primary px-2 text-[12px] font-semibold text-primary-foreground"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-0.5 text-[13px] leading-6 text-foreground/90">
                  <MentionText text={comment.body} members={members} />
                </div>
              )}
            </div>
          </article>
        );
      })}

      {issue.comments.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No comments yet.</p>
      ) : null}

      <div className="rounded-lg border border-border p-2">
        <MentionTextarea
          value={draft}
          onChange={setDraft}
          members={members}
          ariaLabel="New comment"
          placeholder="Leave a comment… use @ to mention someone"
          className="min-h-[56px]"
          onSubmit={() => void submit()}
        />
        <div className="flex items-center justify-end gap-2">
          <span className="beam-meta hidden sm:inline">⌘↵ to send</span>
          <button
            type="button"
            disabled={!draft.trim() || pending}
            onClick={() => void submit()}
            className="inline-flex h-7 cursor-pointer items-center rounded-md bg-primary px-3 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Comment
          </button>
        </div>
      </div>
    </div>
  );
}
