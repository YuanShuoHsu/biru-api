CREATE TABLE "attendance_leave_case" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"reference" text NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"granted_minutes" integer NOT NULL,
	"paid_percent" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_leave_case_interval" CHECK ("attendance_leave_case"."ends_at" > "attendance_leave_case"."starts_at"),
	CONSTRAINT "attendance_leave_case_amount" CHECK ("attendance_leave_case"."granted_minutes" > 0 AND "attendance_leave_case"."paid_percent" BETWEEN 0 AND 100)
);
--> statement-breakpoint
ALTER TABLE "attendance_request" ADD COLUMN "leave_case_id" text;--> statement-breakpoint
ALTER TABLE "attendance_leave_case" ADD CONSTRAINT "attendance_leave_case_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_case" ADD CONSTRAINT "attendance_leave_case_leave_type_id_attendance_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."attendance_leave_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_leave_case_reference_uidx" ON "attendance_leave_case" USING btree ("employee_id","leave_type_id","reference");--> statement-breakpoint
ALTER TABLE "attendance_request" ADD CONSTRAINT "attendance_request_leave_case_id_attendance_leave_case_id_fk" FOREIGN KEY ("leave_case_id") REFERENCES "public"."attendance_leave_case"("id") ON DELETE no action ON UPDATE no action;