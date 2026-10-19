CREATE TABLE "quant_bot_equity" (
	"bot_id" text NOT NULL,
	"time" timestamp NOT NULL,
	"equity" numeric(38, 18) NOT NULL,
	"pnl" numeric(38, 18) NOT NULL,
	CONSTRAINT "quant_bot_equity_bot_id_time_pk" PRIMARY KEY("bot_id","time")
);
--> statement-breakpoint
ALTER TABLE "quant_bot" ADD COLUMN "max_order_amount" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "quant_bot_equity" ADD CONSTRAINT "quant_bot_equity_bot_id_quant_bot_id_fk" FOREIGN KEY ("bot_id") REFERENCES "public"."quant_bot"("id") ON DELETE cascade ON UPDATE no action;