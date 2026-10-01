CREATE TABLE "attendance_shift_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_shift_type_times" CHECK ("attendance_shift_type"."start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "attendance_shift_type"."end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' AND "attendance_shift_type"."start_time" <> "attendance_shift_type"."end_time")
);
--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD COLUMN "team_id" text;--> statement-breakpoint
ALTER TABLE "attendance_shift_type" ADD CONSTRAINT "attendance_shift_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_shift_type_name_uidx" ON "attendance_shift_type" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "attendance_shift" ADD CONSTRAINT "attendance_shift_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE set null ON UPDATE no action;