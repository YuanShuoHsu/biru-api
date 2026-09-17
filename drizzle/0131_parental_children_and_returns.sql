CREATE TABLE "attendance_parental_child" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"reference" text NOT NULL,
	"label" text NOT NULL,
	"birth_date" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_parental_return" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"request_id" text NOT NULL,
	"original_starts_at" timestamp with time zone NOT NULL,
	"original_ends_at" timestamp with time zone NOT NULL,
	"returns_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" text,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_parental_return_interval" CHECK ("attendance_parental_return"."original_starts_at" < "attendance_parental_return"."returns_at" AND "attendance_parental_return"."returns_at" < "attendance_parental_return"."original_ends_at"),
	CONSTRAINT "attendance_parental_return_status" CHECK ("attendance_parental_return"."status" IN ('pending', 'approved', 'rejected', 'withdrawn'))
);
--> statement-breakpoint
ALTER TABLE "attendance_leave_case" ADD COLUMN "child_id" text;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD COLUMN "original_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_parental_child" ADD CONSTRAINT "attendance_parental_child_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_parental_return" ADD CONSTRAINT "attendance_parental_return_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_parental_return" ADD CONSTRAINT "attendance_parental_return_request_id_attendance_request_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."attendance_request"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_parental_child_reference_uidx" ON "attendance_parental_child" USING btree ("organization_id","employee_id","reference");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_parental_return_pending_uidx" ON "attendance_parental_return" USING btree ("request_id") WHERE "attendance_parental_return"."status" = 'pending';--> statement-breakpoint
ALTER TABLE "attendance_leave_case" ADD CONSTRAINT "attendance_leave_case_child_id_attendance_parental_child_id_fk" FOREIGN KEY ("child_id") REFERENCES "public"."attendance_parental_child"("id") ON DELETE no action ON UPDATE no action;