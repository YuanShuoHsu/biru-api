ALTER TABLE "ecpay_payment_attempt" ADD COLUMN "charge_fee" numeric(10, 2);--> statement-breakpoint
UPDATE "ecpay_payment_attempt" AS "attempt"
SET "charge_fee" = "paid"."charge_fee"
FROM (
	SELECT DISTINCT ON ("merchant_trade_no") "merchant_trade_no", ("raw_body"->>'PaymentTypeChargeFee')::numeric(10, 2) AS "charge_fee"
	FROM "ecpay_callback_log"
	WHERE "mac_valid"
		AND "raw_body"->>'PaymentTypeChargeFee' ~ '^\d{1,8}(\.\d{1,2})?$'
		AND (
			("endpoint" = 'return' AND "raw_body"->>'RtnCode' = '1' AND coalesce("raw_body"->>'SimulatePaid', '0') <> '1')
			OR ("endpoint" = 'query' AND "raw_body"->>'TradeStatus' = '1')
		)
	ORDER BY "merchant_trade_no", "created_at" DESC
) AS "paid"
WHERE "attempt"."merchant_trade_no" = "paid"."merchant_trade_no";
