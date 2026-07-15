-- 點數兌換券僅能以點數兌換取得：清除既有資料的其他取得管道設定
UPDATE "coupon"
SET "is_claimable" = false,
    "is_public" = false,
    "issue_trigger" = NULL,
    "issue_min_spend" = NULL
WHERE "points_cost" IS NOT NULL
  AND ("is_claimable" = true OR "is_public" = true OR "issue_trigger" IS NOT NULL OR "issue_min_spend" IS NOT NULL);
