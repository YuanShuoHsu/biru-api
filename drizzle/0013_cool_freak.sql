ALTER TABLE "organization" ADD COLUMN "address_country" text DEFAULT 'TW';--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "address_locality" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "address_region" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "extended_address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "post_office_box_number" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "postal_code" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "street_address" text;--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "address";