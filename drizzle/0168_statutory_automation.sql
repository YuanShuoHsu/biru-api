CREATE TABLE "attendance_annual_leave_deferral" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "maternal_protection_periods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "termination_reason" text;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "termination_noticed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_annual_leave_deferral" ADD CONSTRAINT "attendance_annual_leave_deferral_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_annual_leave_deferral" ADD CONSTRAINT "attendance_annual_leave_deferral_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_annual_leave_deferral_period_uidx" ON "attendance_annual_leave_deferral" USING btree ("employee_id","period_start");--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD CONSTRAINT "attendance_employee_termination" CHECK (("attendance_employee"."termination_reason" IS NULL OR "attendance_employee"."terminated_at" IS NOT NULL) AND ("attendance_employee"."termination_noticed_at" IS NULL OR "attendance_employee"."terminated_at" IS NOT NULL AND "attendance_employee"."termination_noticed_at" <= "attendance_employee"."terminated_at"));