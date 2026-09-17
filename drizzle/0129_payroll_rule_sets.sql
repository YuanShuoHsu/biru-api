CREATE TABLE "payroll_rule_set" (
	"id" text PRIMARY KEY NOT NULL,
	"jurisdiction" text DEFAULT 'TW' NOT NULL,
	"effective_from" text NOT NULL,
	"rule_version" text NOT NULL,
	"rules" jsonb NOT NULL,
	"origin" text NOT NULL,
	"sources" jsonb NOT NULL,
	"rates_carried_from" text,
	"fetched_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_rule_set_period_uidx" ON "payroll_rule_set" USING btree ("jurisdiction","effective_from");--> statement-breakpoint
INSERT INTO "payroll_rule_set" ("id","jurisdiction","effective_from","rule_version","rules","origin","sources")
VALUES ('018f5e27-0000-4000-8000-000000002601','TW','2026-01','TW-2026-01','{"laborPercentBp":1150,"employmentPercentBp":100,"healthPercentBp":517,"laborEmployeeShareBp":2000,"healthEmployeeShareBp":3000,"withholdingRateBp":500,"withholdingExemptTaxCents":"200000","minimumMonthlyWageCents":"2950000","minimumHourlyWageCents":"19600","laborGrades":[29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800],"healthGrades":[29500,30300,31800,33300,34800,36300,38200,40100,42000,43900,45800,48200,50600,53000,55400,57800,60800,63800,66800,69800,72800,76500,80200,83900,87600,92100,96600,101100,105600,110100,115500,120900,126300,131700,137100,142500,147900,150000,156400,162800,169200,175600,182000,189500,197000,204500,212000,219500,228200,236900,245600,254300,263000,273000,283000,293000,303000,313000]}'::jsonb,'seed','[{"label":"勞工保險投保薪資分級表（115.1.1 起適用）","url":"https://data.gov.tw/dataset/6258"},{"label":"全民健康保險投保金額分級表（115.1.1 生效）","url":"https://www.nhi.gov.tw/ch/cp-19421-f9533-2569-1.html"},{"label":"勞工保險普通事故 11.5%＋就業保險 1%（115 年保險費分擔表）","url":"https://www.bli.gov.tw/0100493.html"},{"label":"各類所得扣繳率標準 §2、§13（薪資 5%；應扣繳稅額未逾 2,000 元免扣繳）","url":"https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=G0340028"}]'::jsonb)
ON CONFLICT ("jurisdiction","effective_from") DO UPDATE SET
  "rules" = "payroll_rule_set"."rules" || jsonb_build_object(
    'minimumMonthlyWageCents', '2950000',
    'minimumHourlyWageCents', '19600'
  )
WHERE NOT ("payroll_rule_set"."rules" ? 'minimumMonthlyWageCents');
