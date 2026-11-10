CREATE TYPE "public"."shared_cart_avatar" AS ENUM('cat', 'dog', 'rabbit', 'bear', 'fox', 'panda', 'penguin', 'koala', 'member');--> statement-breakpoint
CREATE TYPE "public"."shared_cart_participant_status" AS ENUM('pending', 'active');--> statement-breakpoint
CREATE TABLE "shared_cart" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"code" text NOT NULL,
	"mode" "order_mode" NOT NULL,
	"table_number" integer,
	"checkout_participant_id" text,
	"checkout_locked_at" timestamp with time zone,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_cart_item" (
	"id" text PRIMARY KEY NOT NULL,
	"shared_cart_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"menu_item_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"modifiers" jsonb NOT NULL,
	"add_ons" jsonb NOT NULL,
	"serving_temperature_level" "serving_temperature_level",
	"sweetness_level" "sweetness_level",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_cart_participant" (
	"id" text PRIMARY KEY NOT NULL,
	"shared_cart_id" text NOT NULL,
	"device_key" text NOT NULL,
	"user_id" text,
	"session_id" text,
	"avatar" "shared_cart_avatar" NOT NULL,
	"nickname" text NOT NULL,
	"member_profile" boolean NOT NULL,
	"status" "shared_cart_participant_status" NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_cart" ADD CONSTRAINT "shared_cart_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart" ADD CONSTRAINT "shared_cart_checkoutParticipantId_fk" FOREIGN KEY ("checkout_participant_id") REFERENCES "public"."shared_cart_participant"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart_item" ADD CONSTRAINT "shared_cart_item_shared_cart_id_shared_cart_id_fk" FOREIGN KEY ("shared_cart_id") REFERENCES "public"."shared_cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart_item" ADD CONSTRAINT "shared_cart_item_participant_id_shared_cart_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."shared_cart_participant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart_participant" ADD CONSTRAINT "shared_cart_participant_shared_cart_id_shared_cart_id_fk" FOREIGN KEY ("shared_cart_id") REFERENCES "public"."shared_cart"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart_participant" ADD CONSTRAINT "shared_cart_participant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_cart_participant" ADD CONSTRAINT "shared_cart_participant_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shared_cart_organizationId_code_unique" ON "shared_cart" USING btree ("organization_id","code");--> statement-breakpoint
CREATE INDEX "shared_cart_item_sharedCartId_idx" ON "shared_cart_item" USING btree ("shared_cart_id");--> statement-breakpoint
CREATE INDEX "shared_cart_participant_sharedCartId_idx" ON "shared_cart_participant" USING btree ("shared_cart_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_cart_participant_sharedCartId_deviceKey_unique" ON "shared_cart_participant" USING btree ("shared_cart_id","device_key");--> statement-breakpoint
CREATE INDEX "shared_cart_participant_deviceKey_idx" ON "shared_cart_participant" USING btree ("device_key");--> statement-breakpoint
CREATE INDEX "shared_cart_participant_userId_idx" ON "shared_cart_participant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "shared_cart_participant_sessionId_idx" ON "shared_cart_participant" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_cart_participant_deviceKey_active_unique" ON "shared_cart_participant" USING btree ("device_key") WHERE "shared_cart_participant"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "shared_cart_participant_deviceKey_pending_unique" ON "shared_cart_participant" USING btree ("device_key") WHERE "shared_cart_participant"."status" = 'pending';