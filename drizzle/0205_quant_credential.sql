CREATE TABLE "quant_credential" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"label" text NOT NULL,
	"api_key_last4" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"encrypted_api_secret" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quant_credential" ADD CONSTRAINT "quant_credential_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quant_credential_user_id_idx" ON "quant_credential" USING btree ("user_id");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."quant_credential" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();