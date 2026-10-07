ALTER TABLE "teams" ADD COLUMN "cycles_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cycle_duration_weeks" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cycle_start_day" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cycle_auto_create" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "cycle_auto_rollover" boolean DEFAULT true NOT NULL;