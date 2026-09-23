ALTER TABLE "menu_item" ALTER COLUMN "serving_temperatures" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "serving_temperatures" SET DEFAULT '{}'::text;--> statement-breakpoint
DROP TYPE "public"."serving_temperature";--> statement-breakpoint
CREATE TYPE "public"."serving_temperature" AS ENUM('Iced', 'Hot');--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "serving_temperatures" SET DEFAULT '{}'::"public"."serving_temperature"[];--> statement-breakpoint
ALTER TABLE "menu_item" ALTER COLUMN "serving_temperatures" SET DATA TYPE "public"."serving_temperature"[] USING "serving_temperatures"::"public"."serving_temperature"[];--> statement-breakpoint
ALTER TABLE "order_item" ALTER COLUMN "serving_temperature_level" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."serving_temperature_level";--> statement-breakpoint
CREATE TYPE "public"."serving_temperature_level" AS ENUM('RegularIce', 'LessIce', 'LightIce', 'NoIce', 'Warm', 'Hot');--> statement-breakpoint
ALTER TABLE "order_item" ALTER COLUMN "serving_temperature_level" SET DATA TYPE "public"."serving_temperature_level" USING "serving_temperature_level"::"public"."serving_temperature_level";--> statement-breakpoint
UPDATE "menu_item" SET "serving_temperatures" = ARRAY(SELECT unnest("serving_temperatures") ORDER BY 1) WHERE cardinality("serving_temperatures") > 1;