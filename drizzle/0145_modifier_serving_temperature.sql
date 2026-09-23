CREATE TYPE "public"."serving_temperature" AS ENUM('Hot', 'Iced');--> statement-breakpoint
ALTER TABLE "modifier" ADD COLUMN "serving_temperature" "serving_temperature";