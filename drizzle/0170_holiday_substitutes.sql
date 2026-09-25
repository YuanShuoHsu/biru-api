CREATE TABLE "attendance_holiday_substitute" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"holiday_date" text NOT NULL,
	"shift_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "regular_leave_weekday" integer;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "rest_day_weekday" integer;--> statement-breakpoint
ALTER TABLE "attendance_holiday_substitute" ADD CONSTRAINT "attendance_holiday_substitute_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holiday_substitute" ADD CONSTRAINT "attendance_holiday_substitute_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_holiday_substitute" ADD CONSTRAINT "attendance_holiday_substitute_shift_id_attendance_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_holiday_substitute_shift_uidx" ON "attendance_holiday_substitute" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_holiday_substitute_holiday_uidx" ON "attendance_holiday_substitute" USING btree ("employee_id","holiday_date");--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD CONSTRAINT "attendance_employee_rest_weekdays" CHECK (("attendance_employee"."regular_leave_weekday" IS NULL) = ("attendance_employee"."rest_day_weekday" IS NULL) AND ("attendance_employee"."regular_leave_weekday" IS NULL OR "attendance_employee"."regular_leave_weekday" BETWEEN 0 AND 6 AND "attendance_employee"."rest_day_weekday" BETWEEN 0 AND 6 AND "attendance_employee"."regular_leave_weekday" <> "attendance_employee"."rest_day_weekday"));