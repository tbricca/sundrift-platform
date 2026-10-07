CREATE TYPE "public"."recurrence_cadence" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."recurrence_cycle_mode" AS ENUM('none', 'current_cycle', 'next_cycle');--> statement-breakpoint
CREATE TYPE "public"."recurrence_run_status" AS ENUM('pending', 'succeeded', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "recurring_issue_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"team_id" text NOT NULL,
	"name" text NOT NULL,
	"template_id" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"cadence" "recurrence_cadence" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"weekdays" jsonb,
	"day_of_month" integer,
	"time_of_day" text DEFAULT '09:00' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"cycle_mode" "recurrence_cycle_mode" DEFAULT 'none' NOT NULL,
	"assignee_id" text,
	"project_id" text,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recurring_issue_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"scheduled_for" timestamp with time zone,
	"issue_id" text,
	"status" "recurrence_run_status" DEFAULT 'pending' NOT NULL,
	"error" text,
	"manual" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "recurring_definition_id" text;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_template_id_issue_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."issue_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_assignee_id_members_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_definitions" ADD CONSTRAINT "recurring_issue_definitions_created_by_members_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_runs" ADD CONSTRAINT "recurring_issue_runs_definition_id_recurring_issue_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."recurring_issue_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_issue_runs" ADD CONSTRAINT "recurring_issue_runs_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_definitions_team_idx" ON "recurring_issue_definitions" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "recurring_definitions_due_idx" ON "recurring_issue_definitions" USING btree ("next_run_at") WHERE "recurring_issue_definitions"."enabled" = true and "recurring_issue_definitions"."archived_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_runs_occurrence_idx" ON "recurring_issue_runs" USING btree ("definition_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "recurring_runs_definition_idx" ON "recurring_issue_runs" USING btree ("definition_id","created_at");--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_recurring_definition_id_recurring_issue_definitions_id_fk" FOREIGN KEY ("recurring_definition_id") REFERENCES "public"."recurring_issue_definitions"("id") ON DELETE set null ON UPDATE no action;