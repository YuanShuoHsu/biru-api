DROP INDEX "order_paymentDue_createdAt_idx";--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "order_status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "order_status" SET DEFAULT 'OrderPaymentDue'::text;--> statement-breakpoint
DROP TYPE "public"."order_status";--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('OrderPaymentDue', 'OrderProcessing', 'OrderPickupAvailable', 'OrderDelivered', 'OrderCancelled', 'OrderProblem');--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "order_status" SET DEFAULT 'OrderPaymentDue'::"public"."order_status";--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "order_status" SET DATA TYPE "public"."order_status" USING "order_status"::"public"."order_status";--> statement-breakpoint
CREATE INDEX "order_paymentDue_createdAt_idx" ON "order" USING btree ("order_status","created_at") WHERE "order"."order_status" = 'OrderPaymentDue';
