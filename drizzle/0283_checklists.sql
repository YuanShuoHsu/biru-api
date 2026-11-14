CREATE TYPE "public"."checklist_item_type" AS ENUM('check', 'number');--> statement-breakpoint
CREATE TYPE "public"."checklist_timing" AS ENUM('opening', 'closing', 'anytime');--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'checklistTemplate';--> statement-breakpoint
CREATE TABLE "checklist_run" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"template_id" text,
	"business_date" date NOT NULL,
	"template_snapshot" jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checklist_run_item" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"item_id" text NOT NULL,
	"item_snapshot" jsonb NOT NULL,
	"checked" boolean,
	"value" numeric(8, 2),
	"out_of_range" boolean DEFAULT false NOT NULL,
	"action_note" text,
	"filled_by" text,
	"filled_by_name" text NOT NULL,
	"filled_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_setting" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"default_templates_created_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checklist_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"timing" "checklist_timing" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_template_item" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"label" text NOT NULL,
	"type" "checklist_item_type" NOT NULL,
	"unit" text,
	"min_value" numeric(8, 2),
	"max_value" numeric(8, 2),
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "checklist_template_item_range" CHECK ("checklist_template_item"."min_value" IS NULL OR "checklist_template_item"."max_value" IS NULL OR "checklist_template_item"."min_value" <= "checklist_template_item"."max_value")
);
--> statement-breakpoint
ALTER TABLE "checklist_run" ADD CONSTRAINT "checklist_run_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_run" ADD CONSTRAINT "checklist_run_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_template"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_run_item" ADD CONSTRAINT "checklist_run_item_run_id_checklist_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."checklist_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_run_item" ADD CONSTRAINT "checklist_run_item_filled_by_user_id_fk" FOREIGN KEY ("filled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_setting" ADD CONSTRAINT "checklist_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_template_item" ADD CONSTRAINT "checklist_template_item_template_id_checklist_template_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."checklist_template"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_run_template_date_uidx" ON "checklist_run" USING btree ("organization_id","template_id","business_date");--> statement-breakpoint
CREATE INDEX "checklist_run_organization_date_idx" ON "checklist_run" USING btree ("organization_id","business_date");--> statement-breakpoint
CREATE INDEX "checklist_run_template_idx" ON "checklist_run" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_run_item_run_item_uidx" ON "checklist_run_item" USING btree ("run_id","item_id");--> statement-breakpoint
CREATE INDEX "checklist_run_item_filled_by_idx" ON "checklist_run_item" USING btree ("filled_by");--> statement-breakpoint
CREATE INDEX "checklist_template_organization_idx" ON "checklist_template" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "checklist_template_item_template_idx" ON "checklist_template_item" USING btree ("template_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."checklist_template" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."checklist_template_item" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."checklist_run" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."checklist_run_item" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."checklist_setting" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
