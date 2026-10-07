/**
 * Right-click menu for a project row.
 *
 * The editable properties come from the same constants the project header
 * pickers use, and every write goes through `update-project` exactly as the
 * header does. No project deletion: Beam has no model for it, and a menu is
 * the wrong place to invent one.
 */
import { callAction } from "@agent-native/core/client/hooks";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";

import { projectMenuModel } from "@/components/command/command-menu";
import { MemberAvatar, PriorityIcon } from "@/components/issues/primitives";

import {
  PROJECT_HEALTH_LABEL,
  PROJECT_HEALTH_ORDER,
  PROJECT_STATUS_LABEL,
  PROJECT_STATUS_ORDER,
  ProjectStatusIcon,
} from "@/components/projects/primitives";
import { useFavorites } from "@/hooks/use-favorites";
import { useWorkspace } from "@/hooks/use-workspace";
import { PRIORITY_LABEL, PRIORITY_ORDER } from "@/lib/issue-query";
import { copyText } from "@/hooks/use-command-runner";
import { invalidateProject, invalidateWorkspace } from "@/lib/query-keys";

import { EntityContextMenu } from "./EntityContextMenu";

export function ProjectRowMenu({
  project,
  onChanged,
  children,
}: {
  project: { id: string; name: string; isFavorite?: boolean };
  onChanged?: () => void;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { workspace } = useWorkspace();
  const { setFavorite } = useFavorites();
  const path = `/projects/${project.id}`;

  async function patch(input: Record<string, unknown>) {
    try {
      await callAction(
        "update-project",
        { projectId: project.id, ...input },
        { method: "PUT" },
      );
      invalidateProject(queryClient);
      onChanged?.();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Could not update the project.",
      );
    }
  }

  const memberOptions = [
    { value: null, label: "No lead" },
    ...(workspace?.members ?? []).map((member) => ({
      value: member.id,
      label: member.name,
      icon: <MemberAvatar member={member} size={16} />,
    })),
  ];

  return (
    <EntityContextMenu
      sections={projectMenuModel(Boolean(project.isFavorite))}
      header={project.name}
      submenus={{
        "project-status": {
          options: PROJECT_STATUS_ORDER.map((entry) => ({
            value: entry,
            label: PROJECT_STATUS_LABEL[entry],
            icon: <ProjectStatusIcon status={entry} />,
          })),
          onPick: (option) => void patch({ status: option.value }),
        },
        "project-priority": {
          options: PRIORITY_ORDER.map((entry) => ({
            value: entry,
            label: PRIORITY_LABEL[entry],
            icon: <PriorityIcon priority={entry} />,
          })),
          onPick: (option) => void patch({ priority: option.value }),
        },
        "project-health": {
          options: PROJECT_HEALTH_ORDER.map((entry) => ({
            value: entry,
            label: PROJECT_HEALTH_LABEL[entry],
          })),
          onPick: (option) => void patch({ health: option.value }),
        },
        "project-lead": {
          options: memberOptions,
          onPick: (option) => void patch({ leadId: option.value }),
        },
      }}
      onSelect={(id) => {
        switch (id) {
          case "open":
            navigate(path);
            break;
          case "project-create-milestone":
            navigate(path);
            break;
          case "project-create-update":
            navigate(`${path}/updates`);
            break;
          case "copy-project-link":
            void copyText(window.location.origin + path, "Project link");
            break;
          case "favorite":
          case "unfavorite":
            void setFavorite("project", project.id, id === "favorite").then(
              () => {
                invalidateWorkspace(queryClient);
                onChanged?.();
              },
            );
            break;
        }
      }}
    >
      {children}
    </EntityContextMenu>
  );
}
