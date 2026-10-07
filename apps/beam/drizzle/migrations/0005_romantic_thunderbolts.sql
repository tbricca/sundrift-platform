CREATE TABLE "issue_subscribers" (
	"issue_id" text NOT NULL,
	"member_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_subscribers_issue_id_member_id_pk" PRIMARY KEY("issue_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "actor_id" text;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_subscribers" ADD CONSTRAINT "issue_subscribers_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_subscribers_member_idx" ON "issue_subscribers" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_members_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");