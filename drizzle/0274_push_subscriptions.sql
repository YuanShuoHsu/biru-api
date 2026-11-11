CREATE TYPE "public"."push_subscription_app" AS ENUM('storefront', 'admin');--> statement-breakpoint
CREATE TABLE "push_subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"lang" "languages" NOT NULL,
	"app" "push_subscription_app" NOT NULL,
	"user_id" text,
	"order_id" text,
	"waitlist_ticket_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscription" ADD CONSTRAINT "push_subscription_waitlist_ticket_id_waitlist_ticket_id_fk" FOREIGN KEY ("waitlist_ticket_id") REFERENCES "public"."waitlist_ticket"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscription_endpoint_unique" ON "push_subscription" USING btree ("endpoint");--> statement-breakpoint
CREATE INDEX "push_subscription_userId_idx" ON "push_subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "push_subscription_orderId_idx" ON "push_subscription" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "push_subscription_waitlistTicketId_idx" ON "push_subscription" USING btree ("waitlist_ticket_id");