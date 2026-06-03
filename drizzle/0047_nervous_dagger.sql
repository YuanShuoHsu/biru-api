CREATE TABLE "menu_item_modifier_group" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_item_id" text NOT NULL,
	"modifier_group_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier" (
	"id" text PRIMARY KEY NOT NULL,
	"modifier_group_id" text NOT NULL,
	"display_name" text NOT NULL,
	"price_adjustment" numeric(10, 2),
	"availability" "item_availability" DEFAULT 'InStock',
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modifier_group" (
	"id" text PRIMARY KEY NOT NULL,
	"menu_id" text,
	"display_name" text NOT NULL,
	"min_selection_count" integer DEFAULT 0 NOT NULL,
	"max_selection_count" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "menu_item_modifier_group" ADD CONSTRAINT "menu_item_modifier_group_menu_item_id_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "public"."menu_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_item_modifier_group" ADD CONSTRAINT "menu_item_modifier_group_modifier_group_id_modifier_group_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier" ADD CONSTRAINT "modifier_modifier_group_id_modifier_group_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "public"."modifier_group"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_group" ADD CONSTRAINT "modifier_group_menu_id_menu_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menu"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menuItemModifierGroup_menuItemId_idx" ON "menu_item_modifier_group" USING btree ("menu_item_id");--> statement-breakpoint
CREATE INDEX "menuItemModifierGroup_modifierGroupId_idx" ON "menu_item_modifier_group" USING btree ("modifier_group_id");--> statement-breakpoint
CREATE INDEX "modifier_modifierGroupId_idx" ON "modifier" USING btree ("modifier_group_id");--> statement-breakpoint
CREATE INDEX "modifierGroup_menuId_idx" ON "modifier_group" USING btree ("menu_id");