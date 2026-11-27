CREATE TABLE "order_review" (
	"id" text PRIMARY KEY NOT NULL,
	"order_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"rating" smallint NOT NULL,
	"comment" text,
	"reply" text,
	"replied_at" timestamp,
	"replied_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "order_review_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "order_review_rating_check" CHECK ("order_review"."rating" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "order_review_item" (
	"id" text PRIMARY KEY NOT NULL,
	"review_id" text NOT NULL,
	"order_item_id" text NOT NULL,
	"liked" boolean NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_review" ADD CONSTRAINT "order_review_order_id_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_review" ADD CONSTRAINT "order_review_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_review" ADD CONSTRAINT "order_review_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_review" ADD CONSTRAINT "order_review_replied_by_user_id_fk" FOREIGN KEY ("replied_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_review_item" ADD CONSTRAINT "order_review_item_review_id_order_review_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."order_review"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_review_item" ADD CONSTRAINT "order_review_item_order_item_id_order_item_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orderReview_organizationId_createdAt_idx" ON "order_review" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "orderReview_userId_idx" ON "order_review" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orderReviewItem_reviewId_orderItemId_uidx" ON "order_review_item" USING btree ("review_id","order_item_id");--> statement-breakpoint
CREATE INDEX "orderReviewItem_orderItemId_idx" ON "order_review_item" USING btree ("order_item_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."order_review" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."order_review_item" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();