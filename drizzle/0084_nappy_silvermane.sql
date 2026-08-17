ALTER TYPE "public"."audit_resource" ADD VALUE 'invoice';--> statement-breakpoint
ALTER TYPE "public"."invoice_status" ADD VALUE 'issuing' BEFORE 'issued';