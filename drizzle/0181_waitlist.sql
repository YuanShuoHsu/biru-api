CREATE TYPE "public"."waitlist_ticket_status" AS ENUM('waiting', 'called', 'seated', 'noShow', 'cancelled');--> statement-breakpoint
CREATE TABLE "waitlist_setting" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"groups" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "waitlist_ticket" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"service_date" date NOT NULL,
	"prefix" text NOT NULL,
	"number" integer NOT NULL,
	"party_size" integer NOT NULL,
	"name" text NOT NULL,
	"phone_number" text NOT NULL,
	"email" text,
	"locale" "languages" NOT NULL,
	"status" "waitlist_ticket_status" DEFAULT 'waiting' NOT NULL,
	"idempotency_key" text,
	"called_at" timestamp,
	"ended_at" timestamp,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "waitlist_ticket_party_size_positive" CHECK ("waitlist_ticket"."party_size" > 0)
);
--> statement-breakpoint
ALTER TABLE "waitlist_setting" ADD CONSTRAINT "waitlist_setting_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_ticket" ADD CONSTRAINT "waitlist_ticket_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waitlist_ticket" ADD CONSTRAINT "waitlist_ticket_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_ticket_number_unique" ON "waitlist_ticket" USING btree ("organization_id","service_date","prefix","number");--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_ticket_active_phone_unique" ON "waitlist_ticket" USING btree ("organization_id","service_date","phone_number") WHERE "waitlist_ticket"."status" in ('waiting', 'called');--> statement-breakpoint
CREATE UNIQUE INDEX "waitlist_ticket_idempotencyKey_unique" ON "waitlist_ticket" USING btree ("organization_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "waitlist_ticket_status_idx" ON "waitlist_ticket" USING btree ("status","service_date");