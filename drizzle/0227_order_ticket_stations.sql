ALTER TABLE "order_ticket_job" DROP CONSTRAINT "order_ticket_job_printer_id_printer_id_fk";
--> statement-breakpoint
DROP INDEX "orderTicketJob_inFlightOrder_idx";--> statement-breakpoint
ALTER TABLE "order_ticket_job" ALTER COLUMN "printer_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "menu_item" ADD COLUMN "order_ticket_printer_id" text;--> statement-breakpoint
ALTER TABLE "menu_section" ADD COLUMN "order_ticket_printer_id" text;--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD COLUMN "order_item_ids" text[];--> statement-breakpoint
UPDATE "order_ticket_job" SET "order_item_ids" = COALESCE((SELECT array_agg("order_item"."id" ORDER BY "order_item"."id") FROM "order_item" WHERE "order_item"."order_id" = "order_ticket_job"."order_id"), '{}');--> statement-breakpoint
ALTER TABLE "order_ticket_job" ALTER COLUMN "order_item_ids" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "printer" ADD COLUMN "is_default" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "printer" SET "is_default" = true WHERE "id" IN (SELECT DISTINCT ON ("organization_id") "id" FROM "printer" WHERE "purpose" = 'orderTicket' ORDER BY "organization_id", "created_at", "id");--> statement-breakpoint
ALTER TABLE "menu_item" ADD CONSTRAINT "menu_item_order_ticket_printer_id_printer_id_fk" FOREIGN KEY ("order_ticket_printer_id") REFERENCES "public"."printer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "menu_section" ADD CONSTRAINT "menu_section_order_ticket_printer_id_printer_id_fk" FOREIGN KEY ("order_ticket_printer_id") REFERENCES "public"."printer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_ticket_job" ADD CONSTRAINT "order_ticket_job_printer_id_printer_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printer"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "menuItem_orderTicketPrinterId_idx" ON "menu_item" USING btree ("order_ticket_printer_id");--> statement-breakpoint
CREATE INDEX "menuSection_orderTicketPrinterId_idx" ON "menu_section" USING btree ("order_ticket_printer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "printer_organizationId_default_idx" ON "printer" USING btree ("organization_id") WHERE "printer"."is_default";--> statement-breakpoint
ALTER TABLE "printer" ADD CONSTRAINT "printer_isDefault_check" CHECK (not "printer"."is_default" or "printer"."purpose" = 'orderTicket');