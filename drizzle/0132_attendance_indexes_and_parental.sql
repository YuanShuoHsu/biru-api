ALTER TABLE "payroll_statement" ADD COLUMN "created_by" text;--> statement-breakpoint
UPDATE "payroll_statement" SET "created_by" = '' WHERE "created_by" IS NULL;--> statement-breakpoint
ALTER TABLE "payroll_statement" ALTER COLUMN "created_by" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD CONSTRAINT "attendance_request_leave_type_id_attendance_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."attendance_leave_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attendance_audit_org_idx" ON "attendance_audit" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_event_employee_idx" ON "attendance_event" USING btree ("employee_id","occurred_at");--> statement-breakpoint
CREATE INDEX "attendance_leave_case_employee_idx" ON "attendance_leave_case" USING btree ("organization_id","employee_id");--> statement-breakpoint
CREATE INDEX "attendance_request_employee_start_idx" ON "attendance_request" USING btree ("employee_id","starts_at");--> statement-breakpoint
CREATE INDEX "attendance_shift_employee_start_idx" ON "attendance_shift" USING btree ("employee_id","starts_at");--> statement-breakpoint
ALTER TABLE "attendance_settings" DROP COLUMN "timezone";