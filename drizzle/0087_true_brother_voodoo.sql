CREATE TYPE "public"."refund_channel" AS ENUM('ecpay', 'manual');--> statement-breakpoint
CREATE TYPE "public"."refund_invoice_action" AS ENUM('none', 'voided', 'allowance', 'failed');--> statement-breakpoint
CREATE TYPE "public"."refund_scope" AS ENUM('full', 'partial');--> statement-breakpoint
ALTER TYPE "public"."order_status" ADD VALUE 'OrderReturned';--> statement-breakpoint
ALTER TYPE "public"."point_transaction_type" ADD VALUE 'revoke';--> statement-breakpoint
CREATE TABLE "invoice_allowance" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"allowance_no" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"remaining_amount" numeric(10, 2) NOT NULL,
	"issued_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "refund" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"scope" "refund_scope" NOT NULL,
	"channel" "refund_channel" NOT NULL,
	"items" jsonb,
	"ecpay_rtn_code" text,
	"ecpay_rtn_msg" text,
	"invoice_action" "refund_invoice_action" DEFAULT 'none' NOT NULL,
	"invoice_error" text,
	"operator_id" text,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "relate_number" text;--> statement-breakpoint
ALTER TABLE "invoice" ADD COLUMN "voided_at" timestamp;--> statement-breakpoint
ALTER TABLE "invoice_allowance" ADD CONSTRAINT "invoice_allowance_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund" ADD CONSTRAINT "refund_operator_id_user_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoiceAllowance_invoiceId_idx" ON "invoice_allowance" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "refund_orderId_idx" ON "refund" USING btree ("order_id");