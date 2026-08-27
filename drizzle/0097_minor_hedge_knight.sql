CREATE INDEX IF NOT EXISTS "invoice_status_updatedAt_idx" ON "invoice" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_problem_createdAt_idx" ON "order" USING btree ("order_status","created_at") WHERE "order"."order_status" = 'OrderProblem';--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_invoiceAction_updatedAt_idx" ON "refund" USING btree ("invoice_action","updated_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "refund_status_updatedAt_idx" ON "refund" USING btree ("status","updated_at");