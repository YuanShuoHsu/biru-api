CREATE TYPE "public"."quant_ai_backtest_status" AS ENUM('running', 'completed', 'failed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."quant_ai_request_status" AS ENUM('pending', 'awaiting_approval', 'executed', 'rejected', 'expired', 'answered');--> statement-breakpoint
CREATE TYPE "public"."quant_ai_source" AS ENUM('claude_api', 'claude_code');--> statement-breakpoint
CREATE TABLE "quant_ai_agent_token" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_last4" text NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_ai_backtest" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment" text NOT NULL,
	"symbol" text NOT NULL,
	"source" "quant_ai_source" NOT NULL,
	"config" jsonb NOT NULL,
	"investment" numeric(38, 18) NOT NULL,
	"fee_rate" numeric(38, 18) NOT NULL,
	"candles" jsonb NOT NULL,
	"status" "quant_ai_backtest_status" NOT NULL,
	"decided_count" integer DEFAULT 0 NOT NULL,
	"cost" numeric(38, 18) DEFAULT 0 NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quant_ai_request" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment" text NOT NULL,
	"bot_id" text,
	"backtest_id" text,
	"candle_time" timestamp NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" "quant_ai_request_status" NOT NULL,
	"decision" jsonb,
	"expires_at" timestamp,
	"answered_at" timestamp,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quant_ai_agent_token" ADD CONSTRAINT "quant_ai_agent_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_ai_backtest" ADD CONSTRAINT "quant_ai_backtest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_ai_request" ADD CONSTRAINT "quant_ai_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_ai_request" ADD CONSTRAINT "quant_ai_request_bot_id_quant_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."quant_bot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quant_ai_request" ADD CONSTRAINT "quant_ai_request_backtest_id_quant_ai_backtest_id_fk" FOREIGN KEY ("backtest_id") REFERENCES "public"."quant_ai_backtest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quant_ai_agent_token_user_environment_idx" ON "quant_ai_agent_token" USING btree ("user_id","environment");--> statement-breakpoint
CREATE UNIQUE INDEX "quant_ai_agent_token_hash_idx" ON "quant_ai_agent_token" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "quant_ai_backtest_user_idx" ON "quant_ai_backtest" USING btree ("user_id","environment","created_at");--> statement-breakpoint
CREATE INDEX "quant_ai_request_user_status_idx" ON "quant_ai_request" USING btree ("user_id","environment","status");--> statement-breakpoint
CREATE INDEX "quant_ai_request_bot_idx" ON "quant_ai_request" USING btree ("bot_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quant_ai_request_backtest_candle_idx" ON "quant_ai_request" USING btree ("backtest_id","candle_time");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."quant_ai_agent_token" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."quant_ai_backtest" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
