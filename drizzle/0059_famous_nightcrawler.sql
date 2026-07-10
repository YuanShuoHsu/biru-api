CREATE TYPE "public"."coupon_discount_type" AS ENUM('fixed', 'percentage');--> statement-breakpoint
CREATE TYPE "public"."coupon_issue_trigger" AS ENUM('signup', 'birthday', 'spend');--> statement-breakpoint
CREATE TYPE "public"."coupon_scope" AS ENUM('order', 'item');--> statement-breakpoint
CREATE TYPE "public"."user_coupon_source" AS ENUM('granted', 'claimed', 'signup', 'birthday', 'spend');--> statement-breakpoint
CREATE TABLE "coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"discount_type" "coupon_discount_type" NOT NULL,
	"discount_value" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_claimable" boolean DEFAULT false NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"issue_min_spend" numeric(10, 2),
	"issue_trigger" "coupon_issue_trigger",
	"menu_item_ids" text[],
	"menu_section_ids" text[],
	"min_subtotal" numeric(10, 2),
	"organization_id" text NOT NULL,
	"per_user_limit" integer,
	"scope" "coupon_scope" DEFAULT 'order' NOT NULL,
	"total_limit" integer,
	"used_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp,
	"valid_until" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_coupon" (
	"id" text PRIMARY KEY NOT NULL,
	"coupon_id" text NOT NULL,
	"order_id" text,
	"source" "user_coupon_source" NOT NULL,
	"used_at" timestamp,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "birth_date" timestamp;--> statement-breakpoint
ALTER TABLE "coupon" ADD CONSTRAINT "coupon_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupon" ADD CONSTRAINT "user_coupon_coupon_id_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupon" ADD CONSTRAINT "user_coupon_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_coupon" ADD CONSTRAINT "user_coupon_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupon_organizationId_idx" ON "coupon" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_organizationId_code_unique" ON "coupon" USING btree ("organization_id",lower("code"));--> statement-breakpoint
CREATE INDEX "userCoupon_userId_couponId_idx" ON "user_coupon" USING btree ("user_id","coupon_id");--> statement-breakpoint
CREATE UNIQUE INDEX "userCoupon_couponId_userId_source_unique" ON "user_coupon" USING btree ("coupon_id","user_id","source") WHERE "source" IN ('claimed', 'signup');