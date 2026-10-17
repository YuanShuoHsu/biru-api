CREATE TYPE "public"."quant_bot_mode" AS ENUM('paper', 'live');--> statement-breakpoint
CREATE TYPE "public"."quant_bot_order_status" AS ENUM('open', 'filled', 'canceled', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."quant_bot_status" AS ENUM('running', 'stopped', 'error');--> statement-breakpoint
CREATE TYPE "public"."quant_bot_type" AS ENUM('grid', 'dca', 'indicator', 'webhook');--> statement-breakpoint
CREATE TABLE "quant_bot" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment" text NOT NULL,
	"credential_id" text,
	"name" text NOT NULL,
	"type" "quant_bot_type" NOT NULL,
	"mode" "quant_bot_mode" NOT NULL,
	"symbol" text NOT NULL,
	"status" "quant_bot_status" DEFAULT 'stopped' NOT NULL,
	"status_reason" text,
	"config" jsonb NOT NULL,
	"investment" numeric(38, 18) NOT NULL,
	"paper_fee_rate" numeric(38, 18),
	"max_daily_loss" numeric(38, 18),
	"pionex_bot_id" text,
	"webhook_token_hash" text,
	"order_sequence" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"stopped_at" timestamp,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_bot_event" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_bot_fill" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"order_id" text NOT NULL,
	"side" text NOT NULL,
	"price" numeric(38, 18) NOT NULL,
	"size" numeric(38, 18) NOT NULL,
	"fee" numeric(38, 18) NOT NULL,
	"fee_coin" text NOT NULL,
	"filled_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_bot_order" (
	"id" text PRIMARY KEY NOT NULL,
	"bot_id" text NOT NULL,
	"client_order_id" text NOT NULL,
	"exchange_order_id" text,
	"side" text NOT NULL,
	"type" text NOT NULL,
	"price" numeric(38, 18),
	"size" numeric(38, 18),
	"amount" numeric(38, 18),
	"filled_size" numeric(38, 18) DEFAULT 0 NOT NULL,
	"filled_amount" numeric(38, 18) DEFAULT 0 NOT NULL,
	"fee" numeric(38, 18) DEFAULT 0 NOT NULL,
	"status" "quant_bot_order_status" DEFAULT 'open' NOT NULL,
	"tag" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quant_bot_order_client_order_id_unique" UNIQUE("client_order_id")
);
--> statement-breakpoint
CREATE TABLE "quant_engine_lease" (
	"environment" text PRIMARY KEY NOT NULL,
	"holder_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
-- 既有金鑰都是在本機綁定的
ALTER TABLE "quant_credential" ADD COLUMN "environment" text NOT NULL DEFAULT 'http://localhost:3001';--> statement-breakpoint
ALTER TABLE "quant_credential" ALTER COLUMN "environment" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quant_bot" ADD CONSTRAINT "quant_bot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_bot" ADD CONSTRAINT "quant_bot_credential_id_quant_credential_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."quant_credential"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_bot_event" ADD CONSTRAINT "quant_bot_event_bot_id_quant_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."quant_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_bot_fill" ADD CONSTRAINT "quant_bot_fill_bot_id_quant_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."quant_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_bot_fill" ADD CONSTRAINT "quant_bot_fill_order_id_quant_bot_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."quant_bot_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_bot_order" ADD CONSTRAINT "quant_bot_order_bot_id_quant_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."quant_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quant_bot_user_id_idx" ON "quant_bot" USING btree ("user_id","environment");--> statement-breakpoint
CREATE INDEX "quant_bot_status_idx" ON "quant_bot" USING btree ("environment","status");--> statement-breakpoint
CREATE INDEX "quant_bot_event_bot_id_idx" ON "quant_bot_event" USING btree ("bot_id","created_at");--> statement-breakpoint
CREATE INDEX "quant_bot_fill_bot_id_idx" ON "quant_bot_fill" USING btree ("bot_id","filled_at");--> statement-breakpoint
CREATE INDEX "quant_bot_order_bot_id_idx" ON "quant_bot_order" USING btree ("bot_id","status");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."quant_bot" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
