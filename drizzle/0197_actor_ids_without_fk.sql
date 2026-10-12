ALTER TABLE "attendance_audit" DROP CONSTRAINT "attendance_audit_actor_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_coupon" DROP CONSTRAINT "user_coupon_granted_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "refund" DROP CONSTRAINT "refund_operator_id_user_id_fk";
