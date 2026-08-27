ALTER TABLE "invoice_allowance" ADD COLUMN "refund_id" text;--> statement-breakpoint
ALTER TABLE "invoice_allowance" ADD CONSTRAINT "invoice_allowance_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- 既有折讓只靠 refund.allowance_no 反查，接回來才能讓補正認得出「這筆退款已經開過折讓」
UPDATE "invoice_allowance" a SET "refund_id" = r."id" FROM "refund" r WHERE r."allowance_no" = a."allowance_no" AND a."refund_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "invoiceAllowance_refundId_unique" ON "invoice_allowance" USING btree ("refund_id");
