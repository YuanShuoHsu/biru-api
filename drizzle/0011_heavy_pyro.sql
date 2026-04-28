CREATE TABLE "team" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "team_member" (
	"id" text PRIMARY KEY NOT NULL,
	"team_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "order_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "orders" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_role" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_item_ingredients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_item_option_choice_ingredients" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_item_option_choices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_item_options" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menu_items" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "menus" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "stores" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tables" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "order_items" CASCADE;--> statement-breakpoint
DROP TABLE "orders" CASCADE;--> statement-breakpoint
DROP TABLE "organization_role" CASCADE;--> statement-breakpoint
DROP TABLE "menu_item_ingredients" CASCADE;--> statement-breakpoint
DROP TABLE "menu_item_option_choice_ingredients" CASCADE;--> statement-breakpoint
DROP TABLE "menu_item_option_choices" CASCADE;--> statement-breakpoint
DROP TABLE "menu_item_options" CASCADE;--> statement-breakpoint
DROP TABLE "menu_items" CASCADE;--> statement-breakpoint
DROP TABLE "menus" CASCADE;--> statement-breakpoint
DROP TABLE "stores" CASCADE;--> statement-breakpoint
DROP TABLE "tables" CASCADE;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "banned" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "invitation" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "supported_locales" "langs"[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "default_locale" "langs" DEFAULT 'zh-TW' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "active_team_id" text;--> statement-breakpoint
ALTER TABLE "team" ADD CONSTRAINT "team_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_organizationId_idx" ON "team" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teamMember_teamId_idx" ON "team_member" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX "teamMember_userId_idx" ON "team_member" USING btree ("user_id");--> statement-breakpoint
DROP TYPE "public"."order_statuses";