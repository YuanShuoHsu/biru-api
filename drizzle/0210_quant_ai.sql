ALTER TYPE "public"."quant_bot_type" ADD VALUE 'ai';--> statement-breakpoint
CREATE TABLE "quant_ai_key" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"environment" text NOT NULL,
	"api_key_last4" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quant_ai_key" ADD CONSTRAINT "quant_ai_key_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quant_ai_key_user_environment_idx" ON "quant_ai_key" USING btree ("user_id","environment");--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."quant_ai_key" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();
