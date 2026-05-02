CREATE TYPE "public"."item_availability" AS ENUM('BackOrder', 'Discontinued', 'InStock', 'InStoreOnly', 'LimitedAvailability', 'MadeToOrder', 'OnlineOnly', 'OutOfStock', 'PreOrder', 'PreSale', 'Reserved', 'SoldOut');--> statement-breakpoint
CREATE TYPE "public"."restricted_diet" AS ENUM('DiabeticDiet', 'GlutenFreeDiet', 'HalalDiet', 'HinduDiet', 'KosherDiet', 'LowCalorieDiet', 'LowFatDiet', 'LowLactoseDiet', 'LowSaltDiet', 'VeganDiet', 'VegetarianDiet');--> statement-breakpoint
CREATE TABLE "menu" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"in_language" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_id" text,
	"menu_section_id" text,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"url" text,
	"suitable_for_diet" "restricted_diet"[],
	"nutrition" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_item_add_on" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"add_on_menu_item_id" text,
	"add_on_menu_section_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "menu_section" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_id" text,
	"parent_section_id" text,
	"name" text NOT NULL,
	"description" text,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text,
	"menu_section_id" text,
	"price" numeric(10, 2),
	"price_currency" text DEFAULT 'TWD',
	"availability" "item_availability" DEFAULT 'InStock',
	"availability_starts" text,
	"availability_ends" text,
	"price_valid_until" text,
	"valid_from" text,
	"valid_through" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu" ADD CONSTRAINT "menu_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_menu_section_id_menu_section_id_fk" FOREIGN KEY ("menu_section_id") REFERENCES "public"."menu_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_add_on" ADD CONSTRAINT "menu_item_add_on_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_add_on" ADD CONSTRAINT "menu_item_add_on_add_on_menu_item_id_menu_item_id_fk" FOREIGN KEY ("add_on_menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_add_on" ADD CONSTRAINT "menu_item_add_on_add_on_menu_section_id_menu_section_id_fk" FOREIGN KEY ("add_on_menu_section_id") REFERENCES "public"."menu_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_section" ADD CONSTRAINT "menu_section_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_section" ADD CONSTRAINT "menu_section_parent_section_id_menu_section_id_fk" FOREIGN KEY ("parent_section_id") REFERENCES "public"."menu_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer" ADD CONSTRAINT "offer_menu_section_id_menu_section_id_fk" FOREIGN KEY ("menu_section_id") REFERENCES "public"."menu_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menu_organizationId_idx" ON "menu" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "menuItem_menuId_idx" ON "menu_item" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "menuItem_menuSectionId_idx" ON "menu_item" USING btree ("menu_section_id");--> statement-breakpoint
CREATE INDEX "menuItemAddOn_menuItemId_idx" ON "menu_item_add_on" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "menuItemAddOn_addOnMenuItemId_idx" ON "menu_item_add_on" USING btree ("add_on_menu_item_id");--> statement-breakpoint
CREATE INDEX "menuItemAddOn_addOnMenuSectionId_idx" ON "menu_item_add_on" USING btree ("add_on_menu_section_id");--> statement-breakpoint
CREATE INDEX "menuSection_menuId_idx" ON "menu_section" USING btree ("menu_id");--> statement-breakpoint
CREATE INDEX "menuSection_parentSectionId_idx" ON "menu_section" USING btree ("parent_section_id");--> statement-breakpoint
CREATE INDEX "offer_menuItemId_idx" ON "offer" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "offer_menuSectionId_idx" ON "offer" USING btree ("menu_section_id");