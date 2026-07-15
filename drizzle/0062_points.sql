CREATE TYPE "public"."point_transaction_type" AS ENUM('earn', 'redeem');--> statement-breakpoint
ALTER TYPE "public"."user_coupon_source" ADD VALUE 'redeemed';--> statement-breakpoint
CREATE TABLE "point_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp,
	"order_id" text,
	"organization_id" text NOT NULL,
	"points" integer NOT NULL,
	"remaining_points" integer DEFAULT 0 NOT NULL,
	"type" "point_transaction_type" NOT NULL,
	"user_coupon_id" text,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coupon" ADD COLUMN "points_cost" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "amount_per_point" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "points_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "points_validity_years" integer;--> statement-breakpoint
ALTER TABLE "point_transaction" ADD CONSTRAINT "point_transaction_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transaction" ADD CONSTRAINT "point_transaction_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transaction" ADD CONSTRAINT "point_transaction_user_coupon_id_user_coupon_id_fk" FOREIGN KEY ("user_coupon_id") REFERENCES "public"."user_coupon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_transaction" ADD CONSTRAINT "point_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pointTransaction_userId_organizationId_idx" ON "point_transaction" USING btree ("user_id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pointTransaction_orderId_earn_unique" ON "point_transaction" USING btree ("order_id") WHERE "type" = 'earn';