CREATE TYPE "public"."order_service_type" AS ENUM('dineIn', 'takeout');--> statement-breakpoint
ALTER TABLE "order" ADD COLUMN "service_type" "order_service_type";--> statement-breakpoint
--> 回填歷史訂單：mode 已足以判定取餐方式者；kiosk 與 counter 無從得知，留 null
UPDATE "order" SET "service_type" = 'dineIn' WHERE "mode" = 'dineIn';--> statement-breakpoint
UPDATE "order" SET "service_type" = 'takeout' WHERE "mode" = 'pickup';