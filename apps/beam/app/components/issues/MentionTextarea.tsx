import { useEffect, useRef, useState } from "react";

import { activeMentionQuery, encodeMention } from "@/lib/mentions";
import type { MemberRef } from "@/lib/types";
import { cn } from "@/lib/utils";

import { MemberAvatar } from "./primitives";

/**
 * A plain textarea plus an `@` autocomplete. Picking a member inserts
 * `@[Name](member:<id>)`, so the association survives renames and edits.
 */
export function MentionTextarea({
  value,
  onChange,
  members,
  placeholder,
  className,
  autoFocus,
  onSubmit,
  onCancel,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  members: MemberRef[];
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  onCancel?: () => void;
  ariaLabel?: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ query: string; start: number } | null>(
    null,
  );
  const [highlighted, setHighlighted] = useState(0);

  const matches = query
    ? members
        .filter((member) =>
          member.name.toLowerCase().includes(query.query.toLowerCase()),
        )
        .slice(0, 6)
    : [];

  useEffect(() => setHighlighted(0), [query?.query]);

  function syncQuery(element: HTMLTextAreaElement) {
    setQuery(activeMentionQuery(element.value, element.selectionStart ?? 0));
  }

  function insertMention(member: MemberRef) {
    if (!query) return;
    const element = textareaRef.current;
    const caret = element?.selectionStart ?? value.length;
    const next =
      value.slice(0, query.start) +
      encodeMention(member.id, member.name) +
      " " +
      value.slice(caret);
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      const position =
        query.start + encodeMention(member.id, member.name).length + 1;
      element?.focus();
      element?.setSelectionRange(position, position);
    });
  }

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        aria-label={ariaLabel}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder}
        onChange={(event) => {
          onChange(event.target.value);
          syncQuery(event.target);
        }}
        onClick={(event) => syncQuery(event.currentTarget)}
        onBlur={() => window.setTimeout(() => setQuery(null), 120)}
        onKeyDown={(event) => {
          if (matches.length) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setHighlighted((index) => (index + 1) % matches.length);
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlighted(
                (index) => (index - 1 + matches.length) % matches.length,
              );
              return;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              event.preventDefault();
              insertMention(matches[highlighted]);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setQuery(null);
              return;
            }
          }
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onSubmit?.();
            return;
          }
          if (event.key === "Escape" && onCancel) {
            event.stopPropagation();
            onCancel();
          }
        }}
        className={cn(
          "w-full resize-none bg-transparent text-[13px] leading-6 outline-none placeholder:text-muted-foreground",
          className,
        )}
      />

      {matches.length ? (
        <ul className="absolute bottom-full z-50 mb-1 w-60 overflow-hidden rounded-md border border-border bg-popover p-1 shadow-md">
          {matches.map((member, index) => (
            <li key={member.id}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  insertMention(member);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-[13px]",
                  index === highlighted && "bg-accent text-accent-foreground",
                )}
              >
                <MemberAvatar member={member} size={18} />
                <span className="truncate">{member.name}</span>
                {member.kind === "agent" ? (
                  <span className="ms-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                    Agent
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
