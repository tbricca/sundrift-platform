/**
 * Secondary by design: quick-create still opens on the title field, and this
 * sits at the end of the team row. Choosing a template prefills the form; it
 * never gates creation, and every value stays editable afterwards.
 */
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

import type { TemplateSummary } from "./useTemplates";

export function TemplatePicker({
  templates,
  selected,
  onSelect,
  onClear,
}: {
  templates: TemplateSummary[];
  selected: TemplateSummary | null;
  onSelect: (template: TemplateSummary) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-6 cursor-pointer items-center gap-1 rounded-md border px-2 text-[12px] transition-colors",
            selected
              ? "border-border bg-accent text-accent-foreground"
              : "border-transparent text-muted-foreground hover:bg-accent/60",
          )}
        >
          {selected ? selected.name : "Template"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        {templates.map((template) => (
          <button
            key={template.id}
            type="button"
            onClick={() => {
              onSelect(template);
              setOpen(false);
            }}
            className="flex w-full cursor-pointer flex-col rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
          >
            <span className="text-[13px]">{template.name}</span>
            {template.summary.length ? (
              <span className="beam-meta truncate">
                {template.summary.join(" \u00b7 ")}
              </span>
            ) : null}
          </button>
        ))}
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onClear();
              setOpen(false);
            }}
            className="mt-1 w-full cursor-pointer rounded-md border-t border-border px-2 py-1.5 text-left text-[12px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop using this template
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
