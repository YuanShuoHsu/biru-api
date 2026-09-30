CREATE TABLE "payroll_earning" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"month" text NOT NULL,
	"earning_type_id" text NOT NULL,
	"amount_cents" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_earning_type" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_tax_identity" (
	"employee_id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"encrypted_tax_id" text NOT NULL,
	"encrypted_address" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_withholding_unit" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"business_number" text NOT NULL,
	"tax_office_code" text NOT NULL,
	"tax_registration_number" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"agent_name" text NOT NULL,
	"representative_name" text NOT NULL,
	"contact_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payroll_earning" ADD CONSTRAINT "payroll_earning_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning" ADD CONSTRAINT "payroll_earning_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning" ADD CONSTRAINT "payroll_earning_earning_type_id_payroll_earning_type_id_fk" FOREIGN KEY ("earning_type_id") REFERENCES "public"."payroll_earning_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_earning_type" ADD CONSTRAINT "payroll_earning_type_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_identity" ADD CONSTRAINT "payroll_tax_identity_employee_id_attendance_employee_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."attendance_employee"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_tax_identity" ADD CONSTRAINT "payroll_tax_identity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_withholding_unit" ADD CONSTRAINT "payroll_withholding_unit_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payroll_earning_employee_month_idx" ON "payroll_earning" USING btree ("employee_id","month");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_earning_type_name_uidx" ON "payroll_earning_type" USING btree ("organization_id","name");