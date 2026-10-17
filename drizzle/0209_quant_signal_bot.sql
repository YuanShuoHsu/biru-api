ALTER TYPE "public"."quant_bot_type" ADD VALUE 'signal';--> statement-breakpoint
ALTER TABLE "quant_bot" ADD COLUMN "pionex_signal_type" text;