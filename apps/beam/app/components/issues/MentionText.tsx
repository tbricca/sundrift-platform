import { Link } from "react-router";

import { useWorkspace } from "@/hooks/use-workspace";
import { tokenizeIssueRefs } from "@/lib/issue-refs";
import { tokenizeMentions } from "@/lib/mentions";
import type { MemberRef } from "@/lib/types";
import { cn } from "@/lib/utils";

export function MentionText({
  text,
  members,
  className,
}: {
  text: string;
  members: MemberRef[];
  className?: string;
}) {
  const { workspace } = useWorkspace();
  const teamKeys = workspace?.teams.map((team) => team.key) ?? [];
  const tokens = tokenizeMentions(text);

  return (
    <span className={cn("whitespace-pre-wrap", className)}>
      {tokens.map((token, index) =>
        token.type === "text" ? (
          <IssueRefText key={index} text={token.value} teamKeys={teamKeys} />
        ) : (
          <span
            key={index}
            title={
              members.find((member) => member.id === token.memberId)?.kind ===
              "agent"
                ? `${token.label} (agent)`
                : token.label
            }
            className="rounded bg-primary/10 px-1 py-px font-medium text-primary"
          >
            @{members.find((member) => member.id === token.memberId)?.name ??
              token.label}
          </span>
        ),
      )}
    </span>
  );
}

/**
 * Turns `ENG-42` written in prose into a link. Recognition is display-only:
 * the stored text is untouched and no issue relation is created, so a
 * reference someone typed never quietly becomes structured data.
 */
function IssueRefText({
  text,
  teamKeys,
}: {
  text: string;
  teamKeys: string[];
}) {
  const tokens = tokenizeIssueRefs(text, teamKeys);

  return (
    <>
      {tokens.map((token, index) =>
        token.type === "text" ? (
          <span key={index}>{token.value}</span>
        ) : (
          <Link
            key={index}
            to={`/issue/${token.identifier}`}
            className="font-medium text-primary hover:underline"
          >
            {token.identifier}
          </Link>
        ),
      )}
    </>
  );
}
