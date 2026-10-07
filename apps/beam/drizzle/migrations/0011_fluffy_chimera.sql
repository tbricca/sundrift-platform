CREATE TYPE "public"."cycle_membership_add_reason" AS ENUM('manual', 'bulk', 'created_in_cycle', 'recurring', 'rollover', 'system');--> statement-breakpoint
CREATE TYPE "public"."cycle_membership_remove_reason" AS ENUM('manual', 'bulk', 'rollover', 'cycle_changed', 'issue_deleted', 'system');--> statement-breakpoint
CREATE TABLE "issue_cycle_memberships" (
	"id" text PRIMARY KEY NOT NULL,
	"issue_id" text NOT NULL,
	"cycle_id" text NOT NULL,
	"team_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"added_by" text,
	"removed_by" text,
	"add_reason" "cycle_membership_add_reason" DEFAULT 'manual' NOT NULL,
	"remove_reason" "cycle_membership_remove_reason"
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cycle_history_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_cycle_memberships" ADD CONSTRAINT "issue_cycle_memberships_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_cycle_memberships" ADD CONSTRAINT "issue_cycle_memberships_cycle_id_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_cycle_memberships" ADD CONSTRAINT "issue_cycle_memberships_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_cycle_memberships" ADD CONSTRAINT "issue_cycle_memberships_added_by_members_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_cycle_memberships" ADD CONSTRAINT "issue_cycle_memberships_removed_by_members_id_fk" FOREIGN KEY ("removed_by") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "issue_cycle_membership_open_idx" ON "issue_cycle_memberships" USING btree ("issue_id") WHERE "issue_cycle_memberships"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "issue_cycle_membership_cycle_added_idx" ON "issue_cycle_memberships" USING btree ("cycle_id","added_at");--> statement-breakpoint
CREATE INDEX "issue_cycle_membership_cycle_removed_idx" ON "issue_cycle_memberships" USING btree ("cycle_id","removed_at");--> statement-breakpoint
CREATE INDEX "issue_cycle_membership_issue_idx" ON "issue_cycle_memberships" USING btree ("issue_id");--> statement-breakpoint
-- Backfill: open one membership row for every issue that currently sits in a
-- cycle.
--
-- `added_at` is the migration timestamp, NOT the moment the issue really
-- entered the cycle -- Beam never recorded that. Nothing below is inferred:
-- no prior cycles, no rollover chain, no original commitment. Each backfilled
-- row is marked `system` so it stays distinguishable from real history.
INSERT INTO "issue_cycle_memberships"
  ("id", "issue_id", "cycle_id", "team_id", "added_at", "add_reason")
SELECT gen_random_uuid()::text, i."id", i."cycle_id", i."team_id", now(), 'system'
FROM "issues" i
WHERE i."cycle_id" IS NOT NULL;--> statement-breakpoint
-- Membership before this instant is unknown, so cycle analytics reports scope
-- metrics as unavailable for any cycle that started earlier.
UPDATE "teams" SET "cycle_history_started_at" = now();
