CREATE TABLE "organization_wifi" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"ssid" text NOT NULL,
	"password" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_wifi" ADD CONSTRAINT "organization_wifi_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."organization_wifi" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
