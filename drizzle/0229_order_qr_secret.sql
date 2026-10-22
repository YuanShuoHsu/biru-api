CREATE TABLE "organization_qr_secret" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"secret" text,
	"previous_secret" text,
	"rotated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_qr_secret" ADD CONSTRAINT "organization_qr_secret_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."organization_qr_secret" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();