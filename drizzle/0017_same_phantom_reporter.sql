ALTER TABLE "offer" ADD COLUMN "sku" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "eligible_quantity_min" integer;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "eligible_quantity_max" integer;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "seller_id" text;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "eligible_region" text[];--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_seller_id_organization_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;