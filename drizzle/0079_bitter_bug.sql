CREATE TYPE "public"."audit_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."audit_resource" AS ENUM('menu', 'menuSection', 'menuItem', 'offer', 'menuItemAddOn', 'modifierGroup', 'modifier', 'menuItemModifierGroup', 'order', 'userCoupon');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"actor_name" text NOT NULL,
	"actor_email" text NOT NULL,
	"organization_id" text NOT NULL,
	"resource" "audit_resource" NOT NULL,
	"resource_id" text NOT NULL,
	"action" "audit_action" NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditLog_organizationId_createdAt_idx" ON "audit_log" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "auditLog_resource_resourceId_createdAt_idx" ON "audit_log" USING btree ("resource","resource_id","created_at");--> statement-breakpoint
CREATE INDEX "auditLog_actorId_idx" ON "audit_log" USING btree ("actor_id");