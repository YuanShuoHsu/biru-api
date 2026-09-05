ALTER TABLE "ingredient_offer" DROP CONSTRAINT "ingredient_offer_supplier_id_supplier_id_fk";
--> statement-breakpoint
DROP INDEX "ingredientOffer_supplierId_idx";--> statement-breakpoint
ALTER TABLE "ingredient" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_supplierId_idx" ON "ingredient" USING btree ("supplier_id");--> statement-breakpoint
-- 廠商改掛在食材上；取排序第一筆採購規格的廠商，那也是成本採用的那一筆
UPDATE "ingredient" i SET "supplier_id" = (
  SELECT o."supplier_id" FROM "ingredient_offer" o
  WHERE o."ingredient_id" = i."id" AND o."supplier_id" IS NOT NULL
  ORDER BY o."sort_order", o."created_at"
  LIMIT 1
);--> statement-breakpoint
ALTER TABLE "ingredient_offer" DROP COLUMN "supplier_id";