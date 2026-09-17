ALTER TABLE "attendance_shift" ADD COLUMN "break_starts_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD COLUMN "break_ends_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "attendance_template" ADD COLUMN "break_start_time" text;--> statement-breakpoint
ALTER TABLE "attendance_template" ADD COLUMN "break_end_time" text;--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD CONSTRAINT "attendance_shift_break" CHECK (("attendance_shift"."break_starts_at" IS NULL AND "attendance_shift"."break_ends_at" IS NULL) OR ("attendance_shift"."break_starts_at" >= "attendance_shift"."starts_at" AND "attendance_shift"."break_ends_at" > "attendance_shift"."break_starts_at" AND "attendance_shift"."break_ends_at" <= "attendance_shift"."ends_at"));--> statement-breakpoint
UPDATE "payroll_rule_set"
SET "rules" = "rules" || '{"partTimeLaborGrades":[11100,12540,13500,15840,16500,17280,17880,19047,20008,21009,22000,23100,24000,25250,26400,27600,28590,29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800]}'::jsonb
WHERE "jurisdiction" = 'TW' AND NOT ("rules" ? 'partTimeLaborGrades');
