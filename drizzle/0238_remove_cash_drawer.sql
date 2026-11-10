DROP TABLE "cash_drawer_movement" CASCADE;--> statement-breakpoint
DROP TABLE "cash_drawer_session" CASCADE;--> statement-breakpoint
DROP TABLE "cash_drawer_setting" CASCADE;--> statement-breakpoint
DROP TYPE "public"."cash_drawer_movement_type";--> statement-breakpoint
DROP TYPE "public"."cash_drawer_session_status";--> statement-breakpoint
DELETE FROM "deleted_record" WHERE "table_name" IN ('cash_drawer_movement', 'cash_drawer_session', 'cash_drawer_setting');