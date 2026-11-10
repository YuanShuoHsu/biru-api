CREATE TYPE "public"."cancel_reason" AS ENUM('storeClosed');--> statement-breakpoint
ALTER TYPE "public"."refund_reason_code" ADD VALUE 'storeClosed' BEFORE 'other';--> statement-breakpoint
CREATE TABLE "organization_special_hours" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"valid_from" date NOT NULL,
	"valid_through" date NOT NULL,
	"opening_hours" text,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organization_special_hours_valid_range" CHECK ("organization_special_hours"."valid_from" <= "organization_special_hours"."valid_through")
);
--> statement-breakpoint
ALTER TABLE "waitlist_ticket" ADD COLUMN "cancel_reason" "cancel_reason";--> statement-breakpoint
ALTER TABLE "organization_special_hours" ADD CONSTRAINT "organization_special_hours_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE SCHEMA IF NOT EXISTS "extensions";--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";--> statement-breakpoint
ALTER TABLE "organization_special_hours" ADD CONSTRAINT "organization_special_hours_no_overlap" EXCLUDE USING gist ("organization_id" WITH =, daterange("valid_from", "valid_through", '[]') WITH &&);--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."organization_special_hours" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
