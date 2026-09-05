CREATE TYPE "public"."inventory_direction" AS ENUM('increase', 'decrease', 'stocktake');--> statement-breakpoint
CREATE TYPE "public"."inventory_reason_code" AS ENUM('orderConsumption', 'orderRestoration');--> statement-breakpoint
CREATE TABLE "inventory_transaction_reason" (
	"id" text PRIMARY KEY NOT NULL,
	"code" "inventory_reason_code",
	"direction" "inventory_direction" NOT NULL,
	"name" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"requires_unit_cost" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "direction" "inventory_direction";--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "reason_id" text;--> statement-breakpoint
ALTER TABLE "inventory_transaction_reason" ADD CONSTRAINT "inventory_transaction_reason_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventoryTransactionReason_organizationId_idx" ON "inventory_transaction_reason" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventoryTransactionReason_organizationId_code_uidx" ON "inventory_transaction_reason" USING btree ("organization_id","code");--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_reason_id_inventory_transaction_reason_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."inventory_transaction_reason"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventoryTransaction_reasonId_idx" ON "inventory_transaction" USING btree ("reason_id");
--> statement-breakpoint
-- 既有的五種 type 拆成「方向」與「理由」：方向是普世運算，理由改由店家維護
INSERT INTO "inventory_transaction_reason"
  ("id", "code", "direction", "name", "organization_id", "requires_unit_cost", "sort_order")
SELECT
  gen_random_uuid()::text,
  r.code::"inventory_reason_code",
  r.direction::"inventory_direction",
  r.name::jsonb,
  o."id",
  r.requires_unit_cost,
  r.sort_order
FROM "organization" o
CROSS JOIN (VALUES
  (NULL, 'increase',  '{"zh-TW":"進貨","zh-CN":"进货","en":"Purchase","ja":"仕入れ","ko":"입고"}', true,  0),
  (NULL, 'decrease',  '{"zh-TW":"報廢","zh-CN":"报废","en":"Waste","ja":"廃棄","ko":"폐기"}',      false, 1),
  (NULL, 'stocktake', '{"zh-TW":"盤點","zh-CN":"盘点","en":"Stocktake","ja":"棚卸","ko":"재고 실사"}', false, 2),
  ('orderConsumption', 'decrease', '{"zh-TW":"訂單耗用","zh-CN":"订单耗用","en":"Order consumption","ja":"注文消費","ko":"주문 소비"}', false, 3),
  ('orderRestoration', 'increase', '{"zh-TW":"訂單回補","zh-CN":"订单回补","en":"Order restoration","ja":"注文戻し","ko":"주문 복원"}', false, 4)
) AS r(code, direction, name, requires_unit_cost, sort_order);--> statement-breakpoint
UPDATE "inventory_transaction" t SET
  "direction" = CASE t."type"
    WHEN 'purchase' THEN 'increase'
    WHEN 'restoration' THEN 'increase'
    WHEN 'adjustment' THEN 'stocktake'
    ELSE 'decrease'
  END::"inventory_direction",
  "reason_id" = (
    SELECT r."id" FROM "inventory_transaction_reason" r
    WHERE r."organization_id" = t."organization_id"
      AND r."code" IS NOT DISTINCT FROM (CASE t."type"
        WHEN 'consumption' THEN 'orderConsumption'
        WHEN 'restoration' THEN 'orderRestoration'
        ELSE NULL
      END)::"inventory_reason_code"
      AND r."direction" = (CASE t."type"
        WHEN 'purchase' THEN 'increase'
        WHEN 'restoration' THEN 'increase'
        WHEN 'adjustment' THEN 'stocktake'
        ELSE 'decrease'
      END)::"inventory_direction"
    ORDER BY r."sort_order"
    LIMIT 1
  );--> statement-breakpoint
ALTER TABLE "inventory_transaction" ALTER COLUMN "direction" SET NOT NULL;
