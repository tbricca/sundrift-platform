CREATE TYPE "public"."link_entity" AS ENUM('issue', 'project');--> statement-breakpoint
CREATE TABLE "entity_links" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"entity_type" "link_entity" NOT NULL,
	"entity_id" text NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"sort_order" real DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "issue_template_labels" (
	"template_id" text NOT NULL,
	"label_id" text NOT NULL,
	CONSTRAINT "issue_template_labels_template_id_label_id_pk" PRIMARY KEY("template_id","label_id")
);
--> statement-breakpoint
CREATE TABLE "issue_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"title_template" text,
	"issue_description" text,
	"priority" "issue_priority",
	"status_id" text,
	"assignee_id" text,
	"project_id" text,
	"cycle_id" text,
	"milestone_id" text,
	"estimate" integer,
	"due_date_offset_days" integer,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_links" ADD CONSTRAINT "entity_links_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_template_labels" ADD CONSTRAINT "issue_template_labels_template_id_issue_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."issue_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_template_labels" ADD CONSTRAINT "issue_template_labels_label_id_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."labels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_status_id_workflow_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."workflow_statuses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_templates" ADD CONSTRAINT "issue_templates_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entity_links_entity_idx" ON "entity_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "issue_templates_team_idx" ON "issue_templates" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "issue_templates_workspace_idx" ON "issue_templates" USING btree ("workspace_id");