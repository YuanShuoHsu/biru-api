ALTER TABLE "organization" ADD COLUMN "is_open" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN "is_active";