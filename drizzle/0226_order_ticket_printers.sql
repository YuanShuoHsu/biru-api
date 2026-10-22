ALTER TYPE "public"."invoice_print_copy" RENAME TO "print_copy";--> statement-breakpoint
ALTER TYPE "public"."invoice_print_job_status" RENAME TO "print_job_status";--> statement-breakpoint
CREATE TYPE "public"."order_ticket_kind" AS ENUM('order', 'refund');--> statement-breakpoint
CREATE TYPE "public"."printer_purpose" AS ENUM('invoice', 'orderTicket');--> statement-breakpoint
ALTER TABLE "invoice_printer" RENAME TO "printer";--> statement-breakpoint
ALTER TABLE "printer" RENAME CONSTRAINT "invoice_printer_pkey" TO "printer_pkey";--> statement-breakpoint
ALTER TABLE "printer" RENAME CONSTRAINT "invoice_printer_username_unique" TO "printer_username_unique";--> statement-breakpoint
ALTER TABLE "printer" RENAME CONSTRAINT "invoice_printer_organization_id_organization_id_fk" TO "printer_organization_id_organization_id_fk";--> statement-breakpoint
ALTER TABLE "printer" DROP CONSTRAINT "invoice_printer_organization_id_unique";--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN "purpose" "printer_purpose" DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "printer" ALTER COLUMN "purpose" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN "name" text;--> statement-breakpoint
CREATE INDEX "printer_organizationId_idx" ON "printer" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printer_organizationId_invoice_idx" ON "printer" USING btree ("organization_id") WHERE "printer"."purpose" = 'invoice';--> statement-breakpoint
CREATE TABLE "order_ticket_job" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"refund_id" text,
	"printer_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"kind" "order_ticket_kind" NOT NULL,
	"copy" "print_copy" NOT NULL,
	"status" "print_job_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"sent_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "orderTicketJob_refundId_check" CHECK (("order_ticket_job"."kind" = 'refund') = ("order_ticket_job"."refund_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD CONSTRAINT "order_ticket_job_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD CONSTRAINT "order_ticket_job_refund_id_refund_id_fk" FOREIGN KEY ("refund_id") REFERENCES "public"."refund"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD CONSTRAINT "order_ticket_job_printer_id_printer_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printer"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD CONSTRAINT "order_ticket_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orderTicketJob_orderId_idx" ON "order_ticket_job" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orderTicketJob_printerId_status_idx" ON "order_ticket_job" USING btree ("printer_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "orderTicketJob_inFlightOrder_idx" ON "order_ticket_job" USING btree ("order_id","printer_id") WHERE "order_ticket_job"."kind" = 'order' and "order_ticket_job"."copy" = 'original' and "order_ticket_job"."status" in ('queued', 'sent', 'unknown');--> statement-breakpoint
CREATE UNIQUE INDEX "orderTicketJob_inFlightRefund_idx" ON "order_ticket_job" USING btree ("refund_id","printer_id") WHERE "order_ticket_job"."kind" = 'refund' and "order_ticket_job"."copy" = 'original' and "order_ticket_job"."status" in ('queued', 'sent', 'unknown');
