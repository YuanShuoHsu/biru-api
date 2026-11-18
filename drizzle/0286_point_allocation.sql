CREATE TYPE "public"."point_allocation_kind" AS ENUM('redeem', 'revoke', 'adjust', 'cancel', 'settle');--> statement-breakpoint
CREATE TABLE "point_allocation" (
	"id" text PRIMARY KEY NOT NULL,
	"consumer_transaction_id" text,
	"kind" "point_allocation_kind" NOT NULL,
	"points" integer NOT NULL,
	"source_organization_id" text,
	"source_transaction_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "point_allocation_points_positive" CHECK ("point_allocation"."points" > 0)
);
--> statement-breakpoint
ALTER TABLE "point_allocation" ADD CONSTRAINT "point_allocation_consumer_transaction_id_point_transaction_id_fk" FOREIGN KEY ("consumer_transaction_id") REFERENCES "public"."point_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_allocation" ADD CONSTRAINT "point_allocation_source_organization_id_organization_id_fk" FOREIGN KEY ("source_organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_allocation" ADD CONSTRAINT "point_allocation_source_transaction_id_point_transaction_id_fk" FOREIGN KEY ("source_transaction_id") REFERENCES "public"."point_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "point_allocation" ADD CONSTRAINT "point_allocation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pointAllocation_sourceOrganizationId_createdAt_idx" ON "point_allocation" USING btree ("source_organization_id","created_at");--> statement-breakpoint
CREATE INDEX "pointAllocation_consumerTransactionId_idx" ON "point_allocation" USING btree ("consumer_transaction_id");--> statement-breakpoint
CREATE INDEX "pointAllocation_sourceTransactionId_idx" ON "point_allocation" USING btree ("source_transaction_id");--> statement-breakpoint
CREATE INDEX "pointAllocation_userId_idx" ON "point_allocation" USING btree ("user_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."point_allocation" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
