ALTER TABLE "quant_credential" ADD COLUMN "futures_max_leverage" integer;--> statement-breakpoint
ALTER TABLE "quant_credential" ADD COLUMN "futures_max_daily_loss" numeric(38, 18);--> statement-breakpoint
ALTER TABLE "quant_credential" ADD COLUMN "futures_min_liquidation_distance" numeric(38, 18);