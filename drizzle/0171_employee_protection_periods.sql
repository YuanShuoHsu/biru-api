ALTER TABLE "attendance_employee" ADD COLUMN "pregnancy_periods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "nursing_periods" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_employee" ADD COLUMN "indigenous_holidays" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD COLUMN "voluntary_labor_insurance_from" text;--> statement-breakpoint
UPDATE "attendance_employee" SET "pregnancy_periods" = "maternal_protection_periods";
