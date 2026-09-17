DROP INDEX "payroll_terms_employee_effective_uidx";--> statement-breakpoint
ALTER TABLE "payroll_statement" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
UPDATE "payroll_statement" SET "idempotency_key" = "id";--> statement-breakpoint
ALTER TABLE "payroll_statement" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_terms" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "payroll_terms" ALTER COLUMN "version" DROP DEFAULT;--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_statement_retry_uidx" ON "payroll_statement" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_terms_employee_effective_uidx" ON "payroll_terms" USING btree ("employee_id","effective_from","version");