CREATE TYPE "public"."invoice_print_copy" AS ENUM('original', 'reprint');--> statement-breakpoint
CREATE TYPE "public"."invoice_print_job_status" AS ENUM('queued', 'sent', 'printed', 'unknown', 'cancelled');--> statement-breakpoint
CREATE TABLE "invoice_print_job" (
	"id" text PRIMARY KEY NOT NULL,
	"invoice_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"copy" "invoice_print_copy" NOT NULL,
	"status" "invoice_print_job_status" DEFAULT 'queued' NOT NULL,
	"error_code" text,
	"sent_at" timestamp,
	"finished_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_printer" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"username" text NOT NULL,
	"digest_ha1" text NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_printer_organization_id_unique" UNIQUE("organization_id"),
	CONSTRAINT "invoice_printer_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "invoice_print_job" ADD CONSTRAINT "invoice_print_job_invoice_id_invoice_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_print_job" ADD CONSTRAINT "invoice_print_job_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_printer" ADD CONSTRAINT "invoice_printer_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoicePrintJob_invoiceId_idx" ON "invoice_print_job" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "invoicePrintJob_organizationId_status_idx" ON "invoice_print_job" USING btree ("organization_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "invoicePrintJob_inFlightOriginal_idx" ON "invoice_print_job" USING btree ("invoice_id") WHERE "invoice_print_job"."copy" = 'original' and "invoice_print_job"."status" in ('queued', 'sent', 'unknown');