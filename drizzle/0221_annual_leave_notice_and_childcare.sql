CREATE TABLE "attendance_annual_leave_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"granted_minutes" integer NOT NULL,
	"notified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "childcare_reduction_periods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_annual_leave_notice" ADD CONSTRAINT "attendance_annual_leave_notice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_annual_leave_notice" ADD CONSTRAINT "attendance_annual_leave_notice_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_annual_leave_notice_period_uidx" ON "attendance_annual_leave_notice" USING btree ("employee_id","period_start");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."attendance_annual_leave_notice" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
