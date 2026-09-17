ALTER TABLE "attendance_audit" DROP CONSTRAINT "attendance_audit_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_employee" DROP CONSTRAINT "attendance_employee_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_event" DROP CONSTRAINT "attendance_event_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_leave_balance" DROP CONSTRAINT "attendance_leave_balance_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_leave_case" DROP CONSTRAINT "attendance_leave_case_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_parental_child" DROP CONSTRAINT "attendance_parental_child_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_parental_return" DROP CONSTRAINT "attendance_parental_return_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_request" DROP CONSTRAINT "attendance_request_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_shift" DROP CONSTRAINT "attendance_shift_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_statement" DROP CONSTRAINT "payroll_statement_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_terms" DROP CONSTRAINT "payroll_terms_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_audit" ADD CONSTRAINT "attendance_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD CONSTRAINT "attendance_employee_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_balance" ADD CONSTRAINT "attendance_leave_balance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_case" ADD CONSTRAINT "attendance_leave_case_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_parental_child" ADD CONSTRAINT "attendance_parental_child_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_parental_return" ADD CONSTRAINT "attendance_parental_return_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD CONSTRAINT "attendance_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD CONSTRAINT "attendance_shift_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD CONSTRAINT "payroll_statement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_terms" ADD CONSTRAINT "payroll_terms_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;