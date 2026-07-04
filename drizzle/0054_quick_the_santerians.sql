ALTER TYPE "public"."order_mode" ADD VALUE 'counter' BEFORE 'dineIn';--> statement-breakpoint
ALTER TYPE "public"."order_mode" ADD VALUE 'kiosk' BEFORE 'pickup';--> statement-breakpoint
ALTER TYPE "public"."order_payment_method" ADD VALUE 'ApplePay' BEFORE 'Cash';--> statement-breakpoint
ALTER TYPE "public"."order_payment_method" ADD VALUE 'iPASS' BEFORE 'TWQR';--> statement-breakpoint
ALTER TYPE "public"."order_payment_method" ADD VALUE 'Jkopay' BEFORE 'TWQR';--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_method_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "payment_date" timestamp;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "trade_no" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "price_currency" text DEFAULT 'TWD';