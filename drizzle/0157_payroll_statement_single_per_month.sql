DROP INDEX "payroll_statement_version_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_statement_month_uidx" ON "payroll_statement" USING btree ("employee_id","month");--> statement-breakpoint
ALTER TABLE "payroll_statement" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "payroll_statement" DROP COLUMN "reopened_by";--> statement-breakpoint
ALTER TABLE "payroll_statement" DROP COLUMN "reopened_at";--> statement-breakpoint
ALTER TABLE "payroll_statement" DROP COLUMN "reopen_reason";