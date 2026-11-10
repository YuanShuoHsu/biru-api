ALTER TYPE "public"."audit_resource" ADD VALUE 'pointTransaction';--> statement-breakpoint
ALTER TYPE "public"."point_transaction_type" ADD VALUE 'adjust';--> statement-breakpoint
ALTER TABLE "point_transaction" ADD COLUMN "adjusted_by" text;--> statement-breakpoint
ALTER TABLE "point_transaction" ADD COLUMN "note" text;