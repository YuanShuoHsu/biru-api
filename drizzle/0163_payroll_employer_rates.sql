UPDATE "payroll_rule_set"
SET "rules" = "rules" || '{
  "laborEmployerShareBp": 7000,
  "healthEmployerShareBp": 6000,
  "healthAverageDependentsBp": 5600,
  "commutingAccidentRateMicros": 700,
  "wageGuaranteeRateMicros": 250,
  "occupationalGrades": [29500, 30300, 31800, 33300, 34800, 36300, 38200, 40100, 42000, 43900, 45800, 48200, 50600, 53000, 55400, 57800, 60800, 63800, 66800, 69800, 72800]
}'::jsonb
WHERE "jurisdiction" = 'TW' AND NOT ("rules" ? 'occupationalGrades');
