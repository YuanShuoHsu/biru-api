CREATE TABLE "inventory_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"created_by" text,
	"idempotency_key" text,
	"idempotency_fingerprint" text,
	"note" text,
	"organization_id" text NOT NULL,
	"received_at" timestamp NOT NULL,
	"supplier_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD COLUMN "receipt_id" text;--> statement-breakpoint
ALTER TABLE "inventory_receipt" ADD CONSTRAINT "inventory_receipt_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt" ADD CONSTRAINT "inventory_receipt_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_receipt" ADD CONSTRAINT "inventory_receipt_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inventoryReceipt_organizationId_idempotencyKey_uidx" ON "inventory_receipt" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "inventoryReceipt_createdBy_idx" ON "inventory_receipt" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "inventoryReceipt_supplierId_idx" ON "inventory_receipt" USING btree ("supplier_id");--> statement-breakpoint
ALTER TABLE "inventory_transaction" ADD CONSTRAINT "inventory_transaction_receipt_id_inventory_receipt_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."inventory_receipt"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventoryTransaction_receiptId_idx" ON "inventory_transaction" USING btree ("receipt_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."inventory_receipt" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
