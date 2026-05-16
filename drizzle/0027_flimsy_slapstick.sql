ALTER TABLE "offer" ALTER COLUMN "accepted_payment_method" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."accepted_payment_method";--> statement-breakpoint
CREATE TYPE "public"."accepted_payment_method" AS ENUM('Cash', 'DirectDebit', 'ByInvoice', 'ByBankTransferInAdvance', 'CheckInAdvance', 'COD', 'PayPal');--> statement-breakpoint
ALTER TABLE "offer" ALTER COLUMN "accepted_payment_method" SET DATA TYPE "public"."accepted_payment_method"[] USING "accepted_payment_method"::"public"."accepted_payment_method"[];