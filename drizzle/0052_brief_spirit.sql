ALTER TABLE "modifier" ALTER COLUMN "availability" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "modifier" ALTER COLUMN "availability" SET DEFAULT 'InStock'::text;--> statement-breakpoint
ALTER TABLE "offer" ALTER COLUMN "availability" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "offer" ALTER COLUMN "availability" SET DEFAULT 'InStock'::text;--> statement-breakpoint
DROP TYPE "public"."item_availability";--> statement-breakpoint
CREATE TYPE "public"."item_availability" AS ENUM('InStock', 'SoldOut', 'Discontinued');--> statement-breakpoint
ALTER TABLE "modifier" ALTER COLUMN "availability" SET DEFAULT 'InStock'::"public"."item_availability";--> statement-breakpoint
ALTER TABLE "modifier" ALTER COLUMN "availability" SET DATA TYPE "public"."item_availability" USING "availability"::"public"."item_availability";--> statement-breakpoint
ALTER TABLE "offer" ALTER COLUMN "availability" SET DEFAULT 'InStock'::"public"."item_availability";--> statement-breakpoint
ALTER TABLE "offer" ALTER COLUMN "availability" SET DATA TYPE "public"."item_availability" USING "availability"::"public"."item_availability";