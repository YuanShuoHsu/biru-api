CREATE TYPE "public"."cash_drawer_movement_type" AS ENUM('payIn', 'payOut');--> statement-breakpoint
CREATE TYPE "public"."cash_drawer_session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "cash_drawer_movement" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"type" "cash_drawer_movement_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"reason" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_movement_amount_positive" CHECK ("cash_drawer_movement"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "cash_drawer_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"status" "cash_drawer_session_status" DEFAULT 'open' NOT NULL,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"opened_by" text NOT NULL,
	"opening_float" numeric(10, 2) NOT NULL,
	"closed_at" timestamp,
	"closed_by" text,
	"counted_cash" numeric(10, 2),
	"denominations" jsonb,
	"expected_cash" numeric(10, 2),
	"variance_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "cash_drawer_session_opening_float_non_negative" CHECK ("cash_drawer_session"."opening_float" >= 0),
	CONSTRAINT "cash_drawer_session_counted_cash_non_negative" CHECK ("cash_drawer_session"."counted_cash" >= 0),
	CONSTRAINT "cash_drawer_session_closed_complete" CHECK ("cash_drawer_session"."status" = 'open' or ("cash_drawer_session"."closed_at" is not null and "cash_drawer_session"."closed_by" is not null and "cash_drawer_session"."counted_cash" is not null and "cash_drawer_session"."expected_cash" is not null))
);
--> statement-breakpoint
ALTER TABLE "cash_drawer_movement" ADD CONSTRAINT "cash_drawer_movement_session_id_cash_drawer_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_drawer_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_drawer_session" ADD CONSTRAINT "cash_drawer_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cashDrawerMovement_sessionId_idx" ON "cash_drawer_movement" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cashDrawerSession_organizationId_openedAt_idx" ON "cash_drawer_session" USING btree ("organization_id","opened_at");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_drawer_session_open_unique" ON "cash_drawer_session" USING btree ("organization_id") WHERE "cash_drawer_session"."status" = 'open';--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."cash_drawer_session" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."cash_drawer_movement" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();