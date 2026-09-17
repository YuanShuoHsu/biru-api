ALTER TABLE "payroll_statement" ADD COLUMN "reopened_by" text;--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD COLUMN "reopened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD COLUMN "reopen_reason" text;