CREATE TYPE "public"."invoice_carrier_type" AS ENUM('individual', 'mobile', 'certificate');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('pending', 'issued', 'voided');--> statement-breakpoint
CREATE TYPE "public"."invoice_type" AS ENUM('personal', 'company', 'donate');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PaymentDue', 'PaymentPastDue', 'PaymentComplete', 'PaymentDeclined');--> statement-breakpoint
CREATE TYPE "public"."order_mode" AS ENUM('dineIn', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('OrderCancelled', 'OrderDelivered', 'OrderPaymentDue', 'OrderPickupAvailable', 'OrderProcessing', 'OrderProblem');--> statement-breakpoint
CREATE TYPE "public"."order_payment_method" AS ENUM('Cash', 'Credit', 'TWQR', 'WeiXin');--> statement-breakpoint
CREATE TABLE "invoice" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"type" "invoice_type" NOT NULL,
	"carrier_type" "invoice_carrier_type",
	"carrier_num" text,
	"email" text,
	"customer_identifier" text,
	"customer_name" text,
	"customer_addr" text,
	"donate_code" text,
	"payment_status" "payment_status" DEFAULT 'PaymentDue' NOT NULL,
	"status" "invoice_status" DEFAULT 'pending' NOT NULL,
	"invoice_number" text,
	"invoice_date" timestamp,
	"random_number" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "order" (
	"id" text PRIMARY KEY NOT NULL,
	"seller_id" text NOT NULL,
	"mode" "order_mode" NOT NULL,
	"order_number" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text,
	"customer_email" text,
	"customer_notes" text,
	"payment_method" "order_payment_method" NOT NULL,
	"order_status" "order_status" DEFAULT 'OrderPaymentDue' NOT NULL,
	"confirmation_number" text,
	"order_date" timestamp DEFAULT now() NOT NULL,
	"payment_due_date" timestamp,
	"discount" numeric(10, 2),
	"discount_currency" text DEFAULT 'TWD',
	"discount_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_confirmation_number_unique" UNIQUE("confirmation_number")
);
--> statement-breakpoint
CREATE TABLE "order_item" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"menu_item_name" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"order_quantity" integer NOT NULL,
	"modifiers" jsonb,
	"add_ons" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice" ADD CONSTRAINT "invoice_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_seller_id_organization_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item" ADD CONSTRAINT "order_item_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_orderId_idx" ON "invoice" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_sellerId_idx" ON "order" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "order_orderNumber_idx" ON "order" USING btree ("order_number");--> statement-breakpoint
CREATE INDEX "order_confirmationNumber_idx" ON "order" USING btree ("confirmation_number");--> statement-breakpoint
CREATE INDEX "orderItem_orderId_idx" ON "order_item" USING btree ("order_id");