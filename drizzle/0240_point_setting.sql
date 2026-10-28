ALTER TYPE "public"."audit_resource" ADD VALUE 'pointSetting';--> statement-breakpoint
CREATE TABLE "point_setting" (
	"id" text PRIMARY KEY DEFAULT 'brand' NOT NULL,
	"amount_per_point" numeric(10, 2),
	"points_validity_years" integer,
	"points_enabled_at" timestamp,
	"accounting_value_per_point" numeric(10, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "point_setting_single_row" CHECK ("point_setting"."id" = 'brand')
);
--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."point_setting" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
INSERT INTO "point_setting" ("amount_per_point", "points_validity_years", "points_enabled_at")
SELECT
	CASE WHEN count(*) = 1 THEN min("amount_per_point") END,
	CASE WHEN count(*) = 1 THEN min("points_validity_years") END,
	CASE WHEN count(*) = 1 THEN now() END
FROM (
	SELECT DISTINCT "amount_per_point", "points_validity_years"
	FROM "organization"
	WHERE "points_enabled_at" IS NOT NULL AND "amount_per_point" IS NOT NULL
) AS "enabled";--> statement-breakpoint
UPDATE "order"
SET "amount_per_point" = NULL,
	"points_validity_years" = NULL
FROM "organization"
WHERE "order"."seller_id" = "organization"."id"
	AND "order"."user_id" IS NOT NULL
	AND "order"."payment_date" IS NOT NULL
	AND "order"."amount_per_point" IS NOT NULL
	AND "order"."order_status" NOT IN ('OrderCancelled', 'OrderProblem', 'OrderReturned')
	AND ("organization"."points_enabled_at" IS NULL OR "organization"."points_enabled_at" > "order"."payment_date")
	AND NOT EXISTS (
		SELECT 1 FROM "point_transaction"
		WHERE "point_transaction"."order_id" = "order"."id" AND "point_transaction"."type" = 'earn'
	);--> statement-breakpoint
UPDATE "order"
SET "amount_per_point" = "organization"."amount_per_point",
	"points_validity_years" = "organization"."points_validity_years"
FROM "organization"
WHERE "order"."seller_id" = "organization"."id"
	AND "organization"."points_enabled_at" IS NOT NULL
	AND "organization"."amount_per_point" IS NOT NULL
	AND "order"."payment_date" IS NOT NULL
	AND "order"."payment_date" >= "organization"."points_enabled_at"
	AND "order"."amount_per_point" IS NULL;
