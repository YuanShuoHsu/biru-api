CREATE TYPE "public"."operating_type" AS ENUM('direct', 'franchise', 'unclassified');--> statement-breakpoint
CREATE TABLE "organization_operating_type" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"operating_type" "operating_type" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_operating_type" ADD CONSTRAINT "organization_operating_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."organization_operating_type" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
INSERT INTO "organization_operating_type" ("organization_id", "operating_type") SELECT "id", 'direct' FROM "organization";
