ALTER TABLE "attendance_shift" DROP CONSTRAINT "attendance_shift_break";--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD COLUMN "breaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_template" ADD COLUMN "breaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "attendance_shift" SET "breaks" = jsonb_build_array(jsonb_build_object(
  'startsAt', to_char("break_starts_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'endsAt', to_char("break_ends_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
))
WHERE "break_starts_at" IS NOT NULL AND "break_ends_at" IS NOT NULL;--> statement-breakpoint
UPDATE "attendance_template" SET "breaks" = jsonb_build_array(jsonb_build_object(
  'startTime', "break_start_time",
  'endTime', "break_end_time"
))
WHERE "break_start_time" IS NOT NULL AND "break_end_time" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_shift" DROP COLUMN "break_starts_at";--> statement-breakpoint
ALTER TABLE "attendance_shift" DROP COLUMN "break_ends_at";--> statement-breakpoint
ALTER TABLE "attendance_template" DROP COLUMN "break_start_time";--> statement-breakpoint
ALTER TABLE "attendance_template" DROP COLUMN "break_end_time";