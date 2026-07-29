ALTER TABLE "order" ALTER COLUMN "mode" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."order_mode";--> statement-breakpoint
CREATE TYPE "public"."order_mode" AS ENUM('counter', 'dineIn', 'driveThru', 'pickup');--> statement-breakpoint
ALTER TABLE "order" ALTER COLUMN "mode" SET DATA TYPE "public"."order_mode" USING "mode"::"public"."order_mode";--> statement-breakpoint
ALTER TABLE "order" DROP COLUMN "service_type";--> statement-breakpoint
DROP TYPE "public"."order_service_type";