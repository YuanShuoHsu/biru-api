ALTER TABLE "order" ADD COLUMN "ready_at" timestamp;--> statement-breakpoint
CREATE INDEX "order_sellerId_readyAt_idx" ON "order" USING btree ("seller_id","ready_at");--> statement-breakpoint
UPDATE "order"
SET "ready_at" = "ready"."ready_at"
FROM (
  SELECT "resource_id", max("created_at") AS "ready_at"
  FROM "audit_log"
  WHERE "resource" = 'order'
    AND "changes" -> 'orderStatus' ->> 'before' = 'OrderProcessing'
    AND "changes" -> 'orderStatus' ->> 'after' = 'OrderPickupAvailable'
  GROUP BY "resource_id"
) AS "ready"
WHERE "order"."id" = "ready"."resource_id"
  AND "order"."order_status" IN ('OrderPickupAvailable', 'OrderDelivered')
  AND "order"."ready_at" IS NULL;
