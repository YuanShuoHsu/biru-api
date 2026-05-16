CREATE TYPE "public"."accepted_payment_method" AS ENUM('Cash', 'CreditCard', 'DebitCard', 'DirectDebit', 'ByInvoice', 'ByBankTransferInAdvance', 'PayPal', 'LinePay', 'ApplePay', 'GooglePay');--> statement-breakpoint
CREATE TYPE "public"."business_function" AS ENUM('Sell', 'ProvideService', 'LeaseOut', 'Repair', 'Maintain', 'Dispose', 'ConstructionInstallation');--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "accepted_payment_method" "accepted_payment_method"[];--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "business_function" "business_function" DEFAULT 'Sell';--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "eligible_transaction_volume" jsonb;--> statement-breakpoint
ALTER TABLE "offer" ADD COLUMN "shipping_details" jsonb;