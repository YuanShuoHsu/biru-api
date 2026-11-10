ALTER TABLE "organization" ALTER COLUMN "address_country" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "address_locality" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "address_region" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "street_address" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_address_not_blank" CHECK (btrim("organization"."address_country") <> '' and btrim("organization"."address_locality") <> '' and btrim("organization"."address_region") <> '' and btrim("organization"."street_address") <> '');