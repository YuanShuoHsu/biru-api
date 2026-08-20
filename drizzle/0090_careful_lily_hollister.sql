CREATE TYPE "public"."refund_status" AS ENUM('pending', 'refunded', 'settled');--> statement-breakpoint
ALTER TABLE "ecpay_callback_log" ALTER COLUMN "mac_valid" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "refund" ALTER COLUMN "invoice_action" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "refund" ALTER COLUMN "invoice_action" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ecpay_callback_log" ADD COLUMN "error" text;--> statement-breakpoint
ALTER TABLE "refund" ADD COLUMN "status" "refund_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "refund" ADD COLUMN "allowance_no" text;--> statement-breakpoint
-- 這個欄位加上去之前的退款都是舊流程一路跑完的，不該被補正排程當成中斷
UPDATE "refund" SET "status" = 'settled';
