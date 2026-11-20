CREATE TYPE "public"."operating_cost_category" AS ENUM('rent', 'electricity', 'water', 'gas', 'telecom', 'insurance', 'equipment', 'marketing', 'personnel', 'other');--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'operatingCost';--> statement-breakpoint
CREATE TABLE "operating_cost" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"category" "operating_cost_category" NOT NULL,
	"effective_from" text NOT NULL,
	"monthly_amount" numeric(12, 2) NOT NULL,
	"input_tax_deductible" boolean NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "operating_cost_effective_from_check" CHECK ("operating_cost"."effective_from" ~ '^20[0-9]{2}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "operating_cost_monthly_amount_check" CHECK ("operating_cost"."monthly_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "operating_cost" ADD CONSTRAINT "operating_cost_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "operatingCost_organizationId_category_effectiveFrom_uidx" ON "operating_cost" USING btree ("organization_id","category","effective_from");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."operating_cost" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
