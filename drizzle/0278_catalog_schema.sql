ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogSection';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogItem';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogModifierGroup';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogModifier';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogItemModifierGroup';--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'catalogItemAddOn';--> statement-breakpoint
CREATE TABLE "catalog_item" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_organization_id" text,
	"catalog_section_id" text,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"image" text,
	"suitable_for_diet" "restricted_diet"[],
	"serving_temperatures" "serving_temperature"[] DEFAULT '{}' NOT NULL,
	"recommended_serving_temperature_level" "serving_temperature_level",
	"sweetness" "sweetness" DEFAULT 'NotApplicable' NOT NULL,
	"fixed_sweetness_level" "sweetness_level",
	"recommended_sweetness_level" "sweetness_level",
	"nutrition" jsonb,
	"suggested_price" numeric(10, 2),
	"price_specification" jsonb,
	"discontinued" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "catalogItem_fixed_sweetness_level" CHECK (("catalog_item"."sweetness" = 'Fixed') = ("catalog_item"."fixed_sweetness_level" IS NOT NULL)),
	CONSTRAINT "catalogItem_recommended_sweetness_level" CHECK ("catalog_item"."recommended_sweetness_level" IS NULL OR "catalog_item"."sweetness" = 'Adjustable')
);
--> statement-breakpoint
CREATE TABLE "catalog_item_add_on" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_item_id" text NOT NULL,
	"add_on_catalog_item_id" text,
	"add_on_catalog_section_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_item_modifier_group" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_item_id" text NOT NULL,
	"catalog_modifier_group_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_modifier" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_modifier_group_id" text NOT NULL,
	"display_name" jsonb NOT NULL,
	"image" text,
	"price_adjustment" numeric(10, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_modifier_group" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_organization_id" text,
	"display_name" jsonb NOT NULL,
	"min_selection_count" integer DEFAULT 0 NOT NULL,
	"max_selection_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "catalog_section" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_organization_id" text,
	"parent_catalog_section_id" text,
	"name" jsonb NOT NULL,
	"description" jsonb,
	"image" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "catalog_item_id" text;--> statement-breakpoint
ALTER TABLE "menu_section" ADD COLUMN "catalog_section_id" text;--> statement-breakpoint
ALTER TABLE "menu_section" ADD COLUMN "hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "modifier" ADD COLUMN "menu_id" text;--> statement-breakpoint
ALTER TABLE "modifier" ADD COLUMN "catalog_modifier_id" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "catalog_item_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "allow_local_menu_items" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "allow_local_pricing" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "shared_cart_item" ADD COLUMN "catalog_item_id" text;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_owner_organization_id_organization_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item" ADD CONSTRAINT "catalog_item_catalog_section_id_catalog_section_id_fk" FOREIGN KEY ("catalog_section_id") REFERENCES "public"."catalog_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_add_on" ADD CONSTRAINT "catalog_item_add_on_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_add_on" ADD CONSTRAINT "catalog_item_add_on_add_on_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("add_on_catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_add_on" ADD CONSTRAINT "catalog_item_add_on_add_on_catalog_section_id_catalog_section_id_fk" FOREIGN KEY ("add_on_catalog_section_id") REFERENCES "public"."catalog_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_modifier_group" ADD CONSTRAINT "catalog_item_modifier_group_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_item_modifier_group" ADD CONSTRAINT "catalog_item_modifier_group_catalog_modifier_group_id_catalog_modifier_group_id_fk" FOREIGN KEY ("catalog_modifier_group_id") REFERENCES "public"."catalog_modifier_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_modifier" ADD CONSTRAINT "catalog_modifier_catalog_modifier_group_id_catalog_modifier_group_id_fk" FOREIGN KEY ("catalog_modifier_group_id") REFERENCES "public"."catalog_modifier_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_modifier_group" ADD CONSTRAINT "catalog_modifier_group_owner_organization_id_organization_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_section" ADD CONSTRAINT "catalog_section_owner_organization_id_organization_id_fk" FOREIGN KEY ("owner_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_section" ADD CONSTRAINT "catalog_section_parent_catalog_section_id_catalog_section_id_fk" FOREIGN KEY ("parent_catalog_section_id") REFERENCES "public"."catalog_section"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalogItem_ownerOrganizationId_idx" ON "catalog_item" USING btree ("owner_organization_id");--> statement-breakpoint
CREATE INDEX "catalogItem_catalogSectionId_idx" ON "catalog_item" USING btree ("catalog_section_id");--> statement-breakpoint
CREATE INDEX "catalogItemAddOn_catalogItemId_idx" ON "catalog_item_add_on" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalogItemAddOn_addOnCatalogItemId_idx" ON "catalog_item_add_on" USING btree ("add_on_catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalogItemAddOn_addOnCatalogSectionId_idx" ON "catalog_item_add_on" USING btree ("add_on_catalog_section_id");--> statement-breakpoint
CREATE INDEX "catalogItemModifierGroup_catalogItemId_idx" ON "catalog_item_modifier_group" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE INDEX "catalogItemModifierGroup_catalogModifierGroupId_idx" ON "catalog_item_modifier_group" USING btree ("catalog_modifier_group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "catalogItemModifierGroup_catalogItemId_catalogModifierGroupId_uidx" ON "catalog_item_modifier_group" USING btree ("catalog_item_id","catalog_modifier_group_id");--> statement-breakpoint
CREATE INDEX "catalogModifier_catalogModifierGroupId_idx" ON "catalog_modifier" USING btree ("catalog_modifier_group_id");--> statement-breakpoint
CREATE INDEX "catalogModifierGroup_ownerOrganizationId_idx" ON "catalog_modifier_group" USING btree ("owner_organization_id");--> statement-breakpoint
CREATE INDEX "catalogSection_ownerOrganizationId_idx" ON "catalog_section" USING btree ("owner_organization_id");--> statement-breakpoint
CREATE INDEX "catalogSection_parentCatalogSectionId_idx" ON "catalog_section" USING btree ("parent_catalog_section_id");--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_catalog_item_id_catalog_item_id_fk" FOREIGN KEY ("catalog_item_id") REFERENCES "public"."catalog_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_section" ADD CONSTRAINT "menu_section_catalog_section_id_catalog_section_id_fk" FOREIGN KEY ("catalog_section_id") REFERENCES "public"."catalog_section"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier" ADD CONSTRAINT "modifier_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier" ADD CONSTRAINT "modifier_catalog_modifier_id_catalog_modifier_id_fk" FOREIGN KEY ("catalog_modifier_id") REFERENCES "public"."catalog_modifier"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menuItem_catalogItemId_idx" ON "menu_item" USING btree ("catalog_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menuItem_menuId_catalogItemId_uidx" ON "menu_item" USING btree ("menu_id","catalog_item_id");--> statement-breakpoint
CREATE INDEX "menuSection_catalogSectionId_idx" ON "menu_section" USING btree ("catalog_section_id");--> statement-breakpoint
CREATE UNIQUE INDEX "menuSection_menuId_catalogSectionId_uidx" ON "menu_section" USING btree ("menu_id","catalog_section_id");--> statement-breakpoint
CREATE INDEX "modifier_catalogModifierId_idx" ON "modifier" USING btree ("catalog_modifier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "modifier_menuId_catalogModifierId_uidx" ON "modifier" USING btree ("menu_id","catalog_modifier_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_section" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_item" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_item_add_on" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_modifier_group" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_modifier" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."catalog_item_modifier_group" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();