import { useActionQuery } from "@agent-native/core/client/hooks";
import { useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { IssueGroupResult, IssueListItem } from "@/lib/types";

import { StatusIcon } from "./primitives";

type ListResult = { groups: IssueGroupResult[]; total: number };

/**
 * Searches issues through the shared query engine (`list-issues` with a search
 * filter) rather than a bespoke search endpoint.
 */
export function IssueSearchPicker({
  trigger,
  teamId,
  excludeIds,
  onSelect,
  placeholder = "Search issues…",
}: {
  trigger: React.ReactNode;
  teamId?: string;
  excludeIds: string[];
  onSelect: (issue: IssueListItem) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const { data } = useActionQuery<ListResult>(
    "list-issues",
    {
      query: {
        filters: { search: search.trim() || undefined, ...(teamId ? { teamId: [teamId] } : {}) },
        grouping: "none",
        ordering: [{ field: "updatedAt", direction: "desc" }],
        layout: "list",
        visibleColumns: [],
      },
    },
    { enabled: open },
  );

  const results = (data?.groups[0]?.issues ?? [])
    .filter((issue) => !excludeIds.includes(issue.id))
    .slice(0, 20);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={search}
            onValueChange={setSearch}
            placeholder={placeholder}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>No matching issues.</CommandEmpty>
            <CommandGroup>
              {results.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={issue.id}
                  onSelect={() => {
                    onSelect(issue);
                    setOpen(false);
                    setSearch("");
                  }}
                  className="gap-2 text-[13px]"
                >
                  <StatusIcon status={issue.status} />
                  <span className="beam-meta w-[62px] shrink-0">
                    {issue.identifier}
                  </span>
                  <span className="truncate">{issue.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
