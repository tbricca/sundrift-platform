CREATE TYPE "public"."triage_status" AS ENUM('pending', 'accepted', 'declined', 'snoozed');--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "triage_status" "triage_status";--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "triaged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "triaged_by" text;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "snoozed_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "triage_source" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "triage_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "default_triage_assignee_id" text;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_triaged_by_members_id_fk" FOREIGN KEY ("triaged_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issues_triage_idx" ON "issues" USING btree ("team_id","triage_status");