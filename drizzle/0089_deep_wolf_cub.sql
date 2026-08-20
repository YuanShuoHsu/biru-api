ALTER TABLE "order" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "order_sellerId_idempotencyKey_unique" ON "order" USING btree ("seller_id","idempotency_key");