/**
 * The two steps behind "Create issue from template": pick a team if the route
 * has not already implied one, then pick a template. Choosing one hands off to
 * the ordinary create dialog — the palette never becomes a second issue form.
 */
import { CommandGroup, CommandItem } from "@/components/ui/command";
import type { TemplateSummary } from "@/components/templates/useTemplates";
import type { WorkspaceTeam } from "@/components/issues/properties";

export function TemplateFlow({
  teams,
  teamId,
  templates,
  onPickTeam,
  onPickTemplate,
}: {
  teams: WorkspaceTeam[];
  /** Empty string means no team has been chosen yet. */
  teamId: string;
  templates: TemplateSummary[];
  onPickTeam: (teamId: string) => void;
  onPickTemplate: (template: TemplateSummary) => void;
}) {
  if (!teamId) {
    return (
      <CommandGroup heading="Team">
        {teams.map((team) => (
          <CommandItem
            key={team.id}
            value={`${team.name} ${team.key}`}
            onSelect={() => onPickTeam(team.id)}
            className="gap-2 text-[13px]"
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: team.color ?? "#8b8f9c" }}
            />
            {team.name}
            <span className="beam-meta ms-auto">{team.key}</span>
          </CommandItem>
        ))}
      </CommandGroup>
    );
  }

  if (templates.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
        This team has no templates yet. Add one under Team - Templates.
      </p>
    );
  }

  return (
    <CommandGroup heading="Templates">
      {templates.map((template) => (
        <CommandItem
          key={template.id}
          value={`${template.name} ${template.description ?? ""}`}
          onSelect={() => onPickTemplate(template)}
          className="gap-2 text-[13px]"
        >
          <span className="truncate">{template.name}</span>
          {template.summary.length ? (
            <span className="beam-meta ms-auto truncate">
              {template.summary.join(" \u00b7 ")}
            </span>
          ) : null}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
