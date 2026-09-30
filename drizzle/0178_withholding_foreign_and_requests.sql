CREATE TABLE "payroll_certificate_request" (
	"employee_id" text NOT NULL,
	"year" integer NOT NULL,
	"organization_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_certificate_request_employee_id_year_pk" PRIMARY KEY("employee_id","year")
);
--> statement-breakpoint
ALTER TABLE "payroll_tax_identity" ADD COLUMN "residence_country_code" text;--> statement-breakpoint
ALTER TABLE "payroll_tax_identity" ADD COLUMN "encrypted_foreign_tax_id" text;--> statement-breakpoint
ALTER TABLE "payroll_certificate_request" ADD CONSTRAINT "payroll_certificate_request_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_certificate_request" ADD CONSTRAINT "payroll_certificate_request_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;