ALTER TYPE "public"."audit_resource" ADD VALUE 'coupon';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'banner';--> statement-breakpoint
ALTER TABLE "audit_log" ALTER COLUMN "organization_id" DROP NOT NULL;