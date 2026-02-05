CREATE TYPE "public"."langs" AS ENUM('en', 'ja', 'ko', 'zh-CN', 'zh-TW');--> statement-breakpoint
ALTER TYPE "public"."order_status" RENAME TO "order_statuses";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'::text;--> statement-breakpoint
DROP TYPE "public"."order_statuses";--> statement-breakpoint
CREATE TYPE "public"."order_statuses" AS ENUM('pending', 'completed', 'cancelled');--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'::"public"."order_statuses";--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "status" SET DATA TYPE "public"."order_statuses" USING "status"::"public"."order_statuses";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "gender" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "gender" SET DEFAULT 'other'::text;--> statement-breakpoint
DROP TYPE "public"."genders";--> statement-breakpoint
CREATE TYPE "public"."genders" AS ENUM('female', 'male', 'other');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "gender" SET DEFAULT 'other'::"public"."genders";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "gender" SET DATA TYPE "public"."genders" USING "gender"::"public"."genders";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'::text;--> statement-breakpoint
DROP TYPE "public"."roles";--> statement-breakpoint
CREATE TYPE "public"."roles" AS ENUM('admin', 'manager', 'staff', 'user');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'user'::"public"."roles";--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE "public"."roles" USING "role"::"public"."roles";--> statement-breakpoint
ALTER TABLE "stores" ALTER COLUMN "address" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "birth_date" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "first_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "last_name" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "last_name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "phone_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "lang" "langs" DEFAULT 'zh-TW' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_phone_number_unique" UNIQUE("phone_number");