ALTER TABLE "payroll_rule_set" ADD COLUMN "checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payroll_rule_set" ADD COLUMN "unconfirmed" jsonb DEFAULT '[]'::jsonb NOT NULL;