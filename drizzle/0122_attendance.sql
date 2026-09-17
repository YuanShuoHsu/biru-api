CREATE TYPE "public"."attendance_action" AS ENUM('clockIn', 'breakStart', 'breakEnd', 'clockOut');--> statement-breakpoint
CREATE TYPE "public"."attendance_request_kind" AS ENUM('correction', 'leave', 'overtime');--> statement-breakpoint
CREATE TYPE "public"."attendance_request_status" AS ENUM('pending', 'approved', 'rejected', 'withdrawn');--> statement-breakpoint
CREATE TABLE "attendance_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"resource_id" text NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_employee" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"hired_at" timestamp with time zone NOT NULL,
	"terminated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"shift_id" text NOT NULL,
	"action" "attendance_action" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"accuracy" double precision NOT NULL,
	"source_ip" text NOT NULL,
	"idempotency_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_leave_balance" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"leave_type_id" text NOT NULL,
	"year" integer NOT NULL,
	"granted_minutes" integer NOT NULL,
	"used_minutes" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "attendance_leave_balance_nonnegative" CHECK ("attendance_leave_balance"."used_minutes" >= 0 AND "attendance_leave_balance"."granted_minutes" >= "attendance_leave_balance"."used_minutes")
);
--> statement-breakpoint
CREATE TABLE "attendance_leave_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"paid_percent" integer NOT NULL,
	"requires_balance" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_request" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"shift_id" text,
	"kind" "attendance_request_kind" NOT NULL,
	"status" "attendance_request_status" DEFAULT 'pending' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"leave_type_id" text,
	"corrected_events" jsonb,
	"reviewed_by" text,
	"review_reason" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_request_interval" CHECK ("attendance_request"."ends_at" > "attendance_request"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "attendance_settings" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"radius_meters" integer NOT NULL,
	"allowed_ips" text[] NOT NULL,
	"timezone" text DEFAULT 'Asia/Taipei' NOT NULL,
	"grace_minutes" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_radius_positive" CHECK ("attendance_settings"."radius_meters" > 0)
);
--> statement-breakpoint
CREATE TABLE "attendance_shift" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"paid_break" boolean DEFAULT false NOT NULL,
	"day_kind" text DEFAULT 'workday' NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_shift_interval" CHECK ("attendance_shift"."ends_at" > "attendance_shift"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_event" ADD CONSTRAINT "attendance_event_shift_id_attendance_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_balance" ADD CONSTRAINT "attendance_leave_balance_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_leave_balance" ADD CONSTRAINT "attendance_leave_balance_leave_type_id_attendance_leave_type_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."attendance_leave_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD CONSTRAINT "attendance_request_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_request" ADD CONSTRAINT "attendance_request_shift_id_attendance_shift_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."attendance_shift"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD CONSTRAINT "attendance_shift_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_employee_org_user_uidx" ON "attendance_employee" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_event_retry_uidx" ON "attendance_event" USING btree ("organization_id","employee_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "attendance_event_shift_idx" ON "attendance_event" USING btree ("shift_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_leave_balance_uidx" ON "attendance_leave_balance" USING btree ("employee_id","leave_type_id","year");--> statement-breakpoint
CREATE INDEX "attendance_request_org_idx" ON "attendance_request" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "attendance_shift_org_start_idx" ON "attendance_shift" USING btree ("organization_id","starts_at");