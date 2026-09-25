INSERT INTO "attendance_leave_type" ("id", "organization_id", "statutory_kind", "name", "paid_percent", "requires_balance", "enabled")
SELECT gen_random_uuid(), "organization"."id", "statutory"."kind", "statutory"."name", NULL, NULL, true
FROM "organization"
CROSS JOIN (VALUES
  ('official', '公假'),
  ('occupationalInjury', '公傷病假'),
  ('jobSearch', '謀職假')
) AS "statutory" ("kind", "name")
WHERE NOT EXISTS (
  SELECT 1 FROM "attendance_leave_type"
  WHERE "attendance_leave_type"."organization_id" = "organization"."id"
    AND "attendance_leave_type"."statutory_kind" = "statutory"."kind"
);--> statement-breakpoint
UPDATE "payroll_rule_set"
SET "rules" = "rules" || '{
  "healthSupplementRateBp": 211,
  "withholdingTable": {
    "year": 2026,
    "exemption": 101000,
    "standardDeduction": 272000,
    "salaryDeduction": 227000,
    "brackets": [
      {"upTo": 610000, "rateBp": 500},
      {"upTo": 1380000, "rateBp": 1200},
      {"upTo": 2770000, "rateBp": 2000},
      {"upTo": 5190000, "rateBp": 3000},
      {"upTo": null, "rateBp": 4000}
    ],
    "retirementExemptPerYear": 206000,
    "retirementHalfTaxablePerYear": 414000
  }
}'::jsonb,
  "sources" = "sources" || '[
    {"label": "115 年度薪資所得扣繳稅額表（財政部台財稅字第 11404675280 號）", "url": "https://www.dot.gov.tw/singlehtml/ch26?cntId=cf5db69f558d42409aa56c70838e8802"},
    {"label": "全民健康保險扣取及繳納補充保險費辦法 §4（兼職薪資達基本工資扣取 2.11%）", "url": "https://law.moj.gov.tw/LawClass/LawSingle.aspx?pcode=L0060027&flno=4"}
  ]'::jsonb
WHERE "jurisdiction" = 'TW' AND NOT ("rules" ? 'withholdingTable');--> statement-breakpoint
UPDATE "payroll_terms"
SET "terms" = (
  "terms" - 'laborInsuranceCents' - 'healthInsuranceCents' - 'voluntaryPensionCents' - 'employerPensionCents' - 'withholdingCents' - 'allowanceHours'
) || CASE WHEN "terms" ? 'insurance' THEN jsonb_build_object(
  'insurance',
  (("terms" -> 'insurance') - 'manualPremiums') || jsonb_build_object(
    'taxMethod', CASE WHEN "terms" -> 'insurance' ->> 'taxMethod' = 'table' THEN 'table' ELSE 'resident5' END,
    'withholdingDependents', COALESCE(("terms" -> 'insurance' ->> 'withholdingDependents')::integer, 0)
  )
) ELSE '{}'::jsonb END;
