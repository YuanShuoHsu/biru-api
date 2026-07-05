ALTER TABLE "order" ADD COLUMN "customer" jsonb;--> statement-breakpoint
UPDATE "order" SET "customer" = jsonb_strip_nulls(jsonb_build_object('email', "customer_email", 'name', "customer_name", 'remark', "customer_notes", 'telephone', "customer_phone"));--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "customer" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "customer_name";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "customer_phone";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "customer_email";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "customer_notes";