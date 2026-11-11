ALTER TABLE "order" ADD COLUMN "shared_cart_id" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "participant_avatar" text;--> statement-breakpoint
ALTER TABLE "order_item" ADD COLUMN "participant_nickname" text;--> statement-breakpoint
CREATE INDEX "order_sharedCartId_idx" ON "order" USING btree ("shared_cart_id");