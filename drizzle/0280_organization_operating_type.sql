CREATE TYPE "public"."organization_operating_type" AS ENUM('direct', 'franchise', 'unclassified');--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "operating_type" "organization_operating_type" DEFAULT 'direct' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ALTER COLUMN "operating_type" SET DEFAULT 'unclassified';
