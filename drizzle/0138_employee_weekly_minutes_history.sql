ALTER TABLE "attendance_employee" ADD COLUMN "weekly_minutes_history" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "attendance_employee" SET "weekly_minutes_history" = jsonb_build_array(
  jsonb_build_object(
    'from', to_char("hired_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'minutes', "weekly_minutes"
  )
) WHERE "weekly_minutes_history" = '[]'::jsonb;
