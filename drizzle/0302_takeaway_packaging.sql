CREATE TYPE "public"."cup_seal" AS ENUM('lid', 'film');--> statement-breakpoint
CREATE TYPE "public"."cup_size" AS ENUM('12oz', '16oz');--> statement-breakpoint
CREATE TABLE "takeaway_packaging" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"serving_temperature" "serving_temperature" NOT NULL,
	"cup_size" "cup_size" NOT NULL,
	"cup_seal" "cup_seal" NOT NULL,
	"recipe_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "catalog_modifier" ADD COLUMN "cup_size" "cup_size";--> statement-breakpoint
ALTER TABLE "catalog_modifier" ADD COLUMN "cup_seal" "cup_seal";--> statement-breakpoint
ALTER TABLE "takeaway_packaging" ADD CONSTRAINT "takeaway_packaging_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "takeaway_packaging" ADD CONSTRAINT "takeaway_packaging_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "takeawayPackaging_organizationId_temperature_size_seal_uidx" ON "takeaway_packaging" USING btree ("organization_id","serving_temperature","cup_size","cup_seal");--> statement-breakpoint
CREATE INDEX "takeawayPackaging_recipeId_idx" ON "takeaway_packaging" USING btree ("recipe_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."takeaway_packaging" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();