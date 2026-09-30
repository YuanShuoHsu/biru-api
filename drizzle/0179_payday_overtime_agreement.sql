ALTER TABLE "attendance_leave_case" ALTER COLUMN "reference" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD COLUMN "overtime_agreed_from" text;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD COLUMN "payday" integer;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD COLUMN "payday_next_month" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD COLUMN "paid_on" text;--> statement-breakpoint
CREATE INDEX "payroll_statement_paid_on_idx" ON "payroll_statement" USING btree ("organization_id","paid_on");--> statement-breakpoint
ALTER TABLE "attendance_employee" DROP COLUMN "enabled";--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_payday" CHECK ("attendance_settings"."payday" IS NULL OR "attendance_settings"."payday" BETWEEN 1 AND 31);--> statement-breakpoint
UPDATE "payroll_statement" SET "paid_on" = to_char("published_at" AT TIME ZONE 'Asia/Taipei', 'YYYY-MM-DD') WHERE "status" = 'published';--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD CONSTRAINT "payroll_statement_published_paid_on" CHECK ("payroll_statement"."status" <> 'published' OR "payroll_statement"."paid_on" IS NOT NULL);