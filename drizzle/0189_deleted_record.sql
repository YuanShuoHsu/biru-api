CREATE TABLE "deleted_record" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"batch_id" bigint NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text,
	"data" jsonb NOT NULL,
	"deleted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "deletedRecord_batchId_idx" ON "deleted_record" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "deletedRecord_deletedAt_idx" ON "deleted_record" USING btree ("deleted_at");