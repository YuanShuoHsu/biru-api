ALTER TABLE "order" ADD COLUMN "coupon_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_coupon_id_coupon_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupon"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_couponId_userId_idx" ON "order" USING btree ("coupon_id","user_id");--> statement-breakpoint
UPDATE "order" o SET coupon_id = uc.coupon_id FROM user_coupon uc WHERE uc.order_id = o.id AND o.coupon_id IS NULL;--> statement-breakpoint
UPDATE "order" o SET coupon_id = c.id FROM coupon c WHERE o.coupon_id IS NULL AND o.discount_code IS NOT NULL AND lower(c.code) = lower(o.discount_code) AND c.created_at <= o.created_at;
