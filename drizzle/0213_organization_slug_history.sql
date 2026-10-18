CREATE TABLE "organization_slug_history" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_slug_history" ADD CONSTRAINT "organization_slug_history_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_history_slug_uidx" ON "organization_slug_history" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "organization_slug_history_organization_id_idx" ON "organization_slug_history" USING btree ("organization_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."organization_slug_history" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();