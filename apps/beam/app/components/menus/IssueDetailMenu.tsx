/**
 * The `...` menu on an issue detail view.
 *
 * Same model and same runner as the right-click menu, only rendered as a
 * dropdown so it stays reachable without a mouse button. Properties are left
 * out: the rail beside it already edits every one of them, and duplicating
 * them here would be two controls for one job.
 */
import { IconDots } from "@tabler/icons-react";

import { issueMenuModel } from "@/components/command/command-menu";
import type { PropertyContext } from "@/components/issues/properties";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCommandRunner } from "@/hooks/use-command-runner";
import type { IssueDetail } from "@/lib/types";
import { cn } from "@/lib/utils";

import { issueCommandContext } from "./IssueRowMenu";

export function IssueDetailMenu({
  issue,
  ctx,
  onRemoveParent,
  onDelete,
}: {
  issue: IssueDetail;
  ctx: PropertyContext;
  /** Detail-only action, offered when the issue has a parent. */
  onRemoveParent?: () => void;
  /** The detail view decides where to go after a delete. */
  onDelete: () => void;
}) {
  const runner = useCommandRunner();

  const sections = issueMenuModel({
    ctx: issueCommandContext([issue]),
    // A single issue is trivially one team and one project.
    scope: {
      singleTeam: true,
      sameProject: true,
      projectId: issue.project?.id ?? null,
    },
    subscribed: issue.subscribed,
  }).filter((section) => section.id !== "properties");

  const target = {
    issues: [issue],
    ctx,
    path: `/issue/${issue.identifier}`,
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Issue actions"
        className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <IconDots className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {issue.parent && onRemoveParent ? (
          <DropdownMenuItem className="text-[13px]" onSelect={onRemoveParent}>
            Remove parent
          </DropdownMenuItem>
        ) : null}
        {sections.map((section, index) => (
          <div key={section.id}>
            {index > 0 || issue.parent ? <DropdownMenuSeparator /> : null}
            {section.items.map((entry) => {
              if (entry.kind !== "command") return null;
              return (
                <DropdownMenuItem
                  key={entry.id}
                  className={cn(
                    "text-[13px]",
                    entry.destructive && "text-destructive",
                  )}
                  onSelect={() => {
                    runner.runCommand(entry.id, target);
                    if (entry.id === "delete") onDelete();
                  }}
                >
                  {entry.label}
                </DropdownMenuItem>
              );
            })}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
