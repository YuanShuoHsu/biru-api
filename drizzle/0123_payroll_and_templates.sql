ALTER TYPE "public"."attendance_request_status" ADD VALUE 'cancellationPending';--> statement-breakpoint
ALTER TYPE "public"."attendance_request_status" ADD VALUE 'cancelled';--> statement-breakpoint
CREATE TABLE "attendance_template" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"name" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"next_day" boolean NOT NULL,
	"paid_break" boolean NOT NULL,
	"day_kind" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_statement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"employee_name" text NOT NULL,
	"month" text NOT NULL,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"terms" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_event" ADD COLUMN "paid_break" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD COLUMN "leave_minutes" integer;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD COLUMN "paid_percent" integer;--> statement-breakpoint
ALTER TABLE "attendance_template" ADD CONSTRAINT "attendance_template_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD CONSTRAINT "payroll_statement_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_terms" ADD CONSTRAINT "payroll_terms_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_statement_version_uidx" ON "payroll_statement" USING btree ("employee_id","month","version");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_terms_employee_effective_uidx" ON "payroll_terms" USING btree ("employee_id","effective_from");