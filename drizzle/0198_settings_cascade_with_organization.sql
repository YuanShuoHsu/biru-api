ALTER TABLE "attendance_audit" DROP CONSTRAINT "attendance_audit_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_shift_type" DROP CONSTRAINT "attendance_shift_type_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_earning_type" DROP CONSTRAINT "payroll_earning_type_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_withholding_unit" DROP CONSTRAINT "payroll_withholding_unit_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_audit" ADD CONSTRAINT "attendance_audit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift_type" ADD CONSTRAINT "attendance_shift_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning_type" ADD CONSTRAINT "payroll_earning_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_withholding_unit" ADD CONSTRAINT "payroll_withholding_unit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."attendance_audit" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
