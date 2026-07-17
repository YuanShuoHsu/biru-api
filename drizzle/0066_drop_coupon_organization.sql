-- 券改品牌層級：發行店概念移除；原「發行店永遠視為適用」語意併入限定店家清單
UPDATE "coupon" SET "applicable_organization_ids" = array_append("applicable_organization_ids", "organization_id") WHERE "applicable_organization_ids" IS NOT NULL AND NOT ("organization_id" = ANY("applicable_organization_ids"));--> statement-breakpoint
ALTER TABLE "coupon" DROP CONSTRAINT "coupon_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "coupon_organizationId_idx";--> statement-breakpoint
DROP INDEX "coupon_organizationId_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_code_unique" ON "coupon" USING btree (lower("code"));--> statement-breakpoint
ALTER TABLE "coupon" DROP COLUMN "organization_id";
