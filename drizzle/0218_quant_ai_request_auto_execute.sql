ALTER TABLE "quant_ai_request" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
UPDATE "quant_ai_request" SET "status" = 'expired', "resolved_at" = COALESCE("resolved_at", now()) WHERE "status" IN ('awaiting_approval', 'rejected');--> statement-breakpoint
DROP TYPE "public"."quant_ai_request_status";--> statement-breakpoint
CREATE TYPE "public"."quant_ai_request_status" AS ENUM('pending', 'executed', 'expired', 'answered');--> statement-breakpoint
ALTER TABLE "quant_ai_request" ALTER COLUMN "status" SET DATA TYPE "public"."quant_ai_request_status" USING "status"::"public"."quant_ai_request_status";