ALTER TABLE "teams" ALTER COLUMN "cycle_history_started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "cycle_history_started_at" SET NOT NULL;