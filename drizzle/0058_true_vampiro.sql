ALTER TABLE "order" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "order" ADD CONSTRAINT "order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_userId_createdAt_idx" ON "order" USING btree ("user_id","created_at");