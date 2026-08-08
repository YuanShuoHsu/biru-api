ALTER TABLE "order" ADD COLUMN "subtotal" numeric(10, 2);--> statement-breakpoint
UPDATE "order" SET "subtotal" = (
	SELECT round(coalesce(sum("oi"."unit_price" * "oi"."order_quantity"), 0))
	FROM "order_item" "oi"
	WHERE "oi"."order_id" = "order"."id"
) WHERE "subtotal" IS NULL;--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "subtotal" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "total" numeric(10, 2) GENERATED ALWAYS AS ("subtotal" - coalesce("discount", 0)) STORED NOT NULL;--> statement-breakpoint
CREATE INDEX "order_sellerId_total_idx" ON "order" USING btree ("seller_id","total");
