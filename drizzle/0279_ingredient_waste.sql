CREATE TYPE "public"."waste_reason" AS ENUM('expired', 'spilled', 'madeWrong', 'damaged', 'other');--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "waste_batch_id" text;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "waste_menu_item_id" text;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "waste_reason" "waste_reason";--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "waste_servings" integer;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_waste_menu_item_id_menu_item_id_fk" FOREIGN KEY ("waste_menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventoryTransaction_wasteMenuItemId_idx" ON "inventory_transaction" USING btree ("waste_menu_item_id");