CREATE TYPE "public"."inventory_transaction_type" AS ENUM('purchase', 'consumption', 'adjustment', 'waste');--> statement-breakpoint
CREATE TYPE "public"."unit_code" AS ENUM('GRM', 'KGM', 'LTR', 'MLT', 'H87');--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'supplier';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'ingredient';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'recipe';--> statement-breakpoint
CREATE TABLE "ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" text,
	"image" text,
	"inventory_level" numeric(12, 3) DEFAULT '0' NOT NULL,
	"low_stock_threshold" numeric(12, 3),
	"name" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"unit_code" "unit_code" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredient_offer" (
	"id" text PRIMARY KEY NOT NULL,
	"eligible_quantity" numeric(12, 3) NOT NULL,
	"eligible_quantity_unit_code" "unit_code" NOT NULL,
	"ingredient_id" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"price_currency" text DEFAULT 'TWD' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"supplier_id" text,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inventory_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"note" text,
	"order_id" text,
	"organization_id" text NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"type" "inventory_transaction_type" NOT NULL,
	"unit_cost" numeric(10, 4),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text,
	"name" jsonb NOT NULL,
	"organization_id" text NOT NULL,
	"recipe_instructions" jsonb,
	"recipe_yield" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredient" (
	"id" text PRIMARY KEY NOT NULL,
	"ingredient_id" text NOT NULL,
	"recipe_id" text NOT NULL,
	"required_quantity" numeric(12, 3) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"note" text,
	"organization_id" text NOT NULL,
	"telephone" text,
	"url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ingredient" ADD CONSTRAINT "ingredient_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_offer" ADD CONSTRAINT "ingredient_offer_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingredient_offer" ADD CONSTRAINT "ingredient_offer_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_ingredient_id_ingredient_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredient"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredient" ADD CONSTRAINT "recipe_ingredient_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier" ADD CONSTRAINT "supplier_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ingredient_organizationId_idx" ON "ingredient" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ingredientOffer_ingredientId_idx" ON "ingredient_offer" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "ingredientOffer_supplierId_idx" ON "ingredient_offer" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "inventoryTransaction_ingredientId_idx" ON "inventory_transaction" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "inventoryTransaction_organizationId_idx" ON "inventory_transaction" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "inventoryTransaction_orderId_idx" ON "inventory_transaction" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "recipe_organizationId_idx" ON "recipe" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_menuItemId_uidx" ON "recipe" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "recipeIngredient_ingredientId_idx" ON "recipe_ingredient" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "recipeIngredient_recipeId_idx" ON "recipe_ingredient" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "supplier_organizationId_idx" ON "supplier" USING btree ("organization_id");