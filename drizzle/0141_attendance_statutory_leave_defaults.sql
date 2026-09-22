ALTER TABLE "attendance_leave_type" ALTER COLUMN "paid_percent" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "attendance_leave_type" ALTER COLUMN "requires_balance" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "attendance_leave_type" ALTER COLUMN "requires_balance" DROP NOT NULL;--> statement-breakpoint
UPDATE "attendance_leave_type" SET "paid_percent" = NULL, "requires_balance" = NULL, "enabled" = true WHERE "statutory_kind" <> 'custom';--> statement-breakpoint
INSERT INTO "attendance_leave_type" ("id", "organization_id", "statutory_kind", "name", "paid_percent", "requires_balance", "enabled")
SELECT gen_random_uuid(), "organization"."id", "statutory"."kind", "statutory"."name", NULL, NULL, true
FROM "organization"
CROSS JOIN (VALUES
  ('annual', '特別休假'),
  ('personal', '事假'),
  ('familyCare', '家庭照顧假'),
  ('sick', '普通傷病假'),
  ('hospitalSick', '住院傷病假'),
  ('pregnancyRest', '安胎休養假'),
  ('parental', '育嬰留職停薪'),
  ('menstrual', '生理假'),
  ('marriage', '婚假'),
  ('funeral8', '喪假（父母／配偶）'),
  ('funeral6', '喪假（祖父母／子女／配偶父母）'),
  ('funeral3', '喪假（曾祖父母／兄弟姊妹／配偶祖父母）'),
  ('prenatal', '產檢假'),
  ('paternity', '陪產檢及陪產假'),
  ('maternity', '產假'),
  ('miscarriage28', '流產假（妊娠滿 3 個月）'),
  ('miscarriage7', '流產假（妊娠 2–3 個月）'),
  ('miscarriage5', '流產假（妊娠未滿 2 個月）')
) AS "statutory" ("kind", "name")
WHERE NOT EXISTS (
  SELECT 1 FROM "attendance_leave_type"
  WHERE "attendance_leave_type"."organization_id" = "organization"."id"
    AND "attendance_leave_type"."statutory_kind" = "statutory"."kind"
);--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_leave_type_statutory_uidx" ON "attendance_leave_type" USING btree ("organization_id","statutory_kind") WHERE "attendance_leave_type"."statutory_kind" <> 'custom';--> statement-breakpoint
ALTER TABLE "attendance_leave_type" ADD CONSTRAINT "attendance_leave_type_custom_rules" CHECK (("attendance_leave_type"."statutory_kind" = 'custom') = ("attendance_leave_type"."paid_percent" IS NOT NULL AND "attendance_leave_type"."requires_balance" IS NOT NULL));
