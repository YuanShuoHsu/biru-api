DROP INDEX "invoice_status_updatedAt_idx";--> statement-breakpoint
DROP INDEX "refund_invoiceAction_updatedAt_idx";--> statement-breakpoint
DROP INDEX "refund_status_updatedAt_idx";--> statement-breakpoint
DROP INDEX "order_paymentDue_createdAt_idx";--> statement-breakpoint
DROP INDEX "order_problem_createdAt_idx";--> statement-breakpoint
ALTER TABLE "refund" ADD COLUMN "invoice_retry_at" timestamp;--> statement-breakpoint
ALTER TABLE "refund" ADD COLUMN "invoice_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
-- 補正 cron 只認領 invoice_retry_at 已到期的列，既有失敗紀錄留 NULL 會再也輪不到重試
UPDATE "refund" SET "invoice_retry_at" = now() WHERE "invoice_action" = 'failed';--> statement-breakpoint
CREATE INDEX "invoice_unissued_updatedAt_idx" ON "invoice" USING btree ("updated_at") WHERE "invoice"."status" in ('pending', 'issuing');--> statement-breakpoint
CREATE INDEX "refund_invoiceRetryAt_idx" ON "refund" USING btree ("invoice_retry_at") WHERE "refund"."invoice_action" = 'failed';--> statement-breakpoint
CREATE INDEX "refund_pending_createdAt_idx" ON "refund" USING btree ("created_at") WHERE "refund"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "refund_unsettled_updatedAt_idx" ON "refund" USING btree ("updated_at") WHERE "refund"."status" in ('refunded', 'settling');--> statement-breakpoint
CREATE INDEX "order_paymentDue_createdAt_idx" ON "order" USING btree ("created_at") WHERE "order"."order_status" = 'OrderPaymentDue';--> statement-breakpoint
CREATE INDEX "order_problem_createdAt_idx" ON "order" USING btree ("created_at") WHERE "order"."order_status" = 'OrderProblem' and "order"."reconciled_at" is null;