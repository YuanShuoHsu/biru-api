CREATE TYPE "public"."cash_device_event_type" AS ENUM('payment', 'change', 'refundDispense', 'refill', 'collection', 'inventorySnapshot', 'error');--> statement-breakpoint
CREATE TYPE "public"."cash_device_status" AS ENUM('active', 'inactive');--> statement-breakpoint
ALTER TYPE "public"."audit_resource" ADD VALUE 'cashDevice';--> statement-breakpoint
CREATE TABLE "cash_device" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"vendor" text,
	"model" text,
	"status" "cash_device_status" DEFAULT 'active' NOT NULL,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cash_device_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"device_id" text NOT NULL,
	"type" "cash_device_event_type" NOT NULL,
	"external_id" text,
	"denominations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"amount" numeric(10, 2),
	"reported_amount" numeric(10, 2),
	"deposited_amount" numeric(10, 2),
	"note" text,
	"created_by" text,
	"occurred_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_device" ADD CONSTRAINT "cash_device_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_device_event" ADD CONSTRAINT "cash_device_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_device_event" ADD CONSTRAINT "cash_device_event_device_id_cash_device_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."cash_device"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_device_event" ADD CONSTRAINT "cash_device_event_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashDevice_organizationId_idx" ON "cash_device" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cashDeviceEvent_deviceId_externalId_idx" ON "cash_device_event" USING btree ("device_id","external_id");--> statement-breakpoint
CREATE INDEX "cashDeviceEvent_organizationId_occurredAt_idx" ON "cash_device_event" USING btree ("organization_id","occurred_at");--> statement-breakpoint
CREATE INDEX "cashDeviceEvent_createdBy_idx" ON "cash_device_event" USING btree ("created_by");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."cash_device" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."cash_device_event" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
