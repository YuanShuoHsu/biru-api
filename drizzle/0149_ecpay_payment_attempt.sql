CREATE TABLE "ecpay_payment_attempt" (
	"merchant_trade_no" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "merchant_trade_no" text;--> statement-breakpoint
ALTER TABLE "ecpay_payment_attempt" ADD CONSTRAINT "ecpay_payment_attempt_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ecpayPaymentAttempt_orderId_idx" ON "ecpay_payment_attempt" USING btree ("order_id");--> statement-breakpoint
-- 既有訂單一律拿 confirmation_number 當 MerchantTradeNo 送過綠界
INSERT INTO "ecpay_payment_attempt" ("merchant_trade_no", "order_id", "created_at", "updated_at")
SELECT "confirmation_number", "id", "created_at", "created_at" FROM "order"
WHERE "payment_method" <> 'Cash' AND "confirmation_number" IS NOT NULL;--> statement-breakpoint
UPDATE "order" SET "merchant_trade_no" = "confirmation_number" WHERE "trade_no" IS NOT NULL;
