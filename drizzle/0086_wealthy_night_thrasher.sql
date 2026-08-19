CREATE TYPE "public"."ecpay_callback_endpoint" AS ENUM('return', 'result', 'query');--> statement-breakpoint
CREATE TABLE "ecpay_callback_log" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" "ecpay_callback_endpoint" NOT NULL,
	"merchant_trade_no" text,
	"raw_body" jsonb NOT NULL,
	"mac_valid" boolean NOT NULL,
	"handled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ecpayCallbackLog_merchantTradeNo_idx" ON "ecpay_callback_log" USING btree ("merchant_trade_no");