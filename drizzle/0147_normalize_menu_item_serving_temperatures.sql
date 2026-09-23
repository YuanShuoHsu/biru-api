-- 寫入端改為依 enum 順序去重排序；既有資料同步正規化（enum 型別的 ORDER BY 依宣告順序）
UPDATE "menu_item" SET "serving_temperatures" = (
  SELECT coalesce(array_agg(DISTINCT "temperature" ORDER BY "temperature"), '{}')
  FROM unnest("menu_item"."serving_temperatures") AS "temperature"
)
WHERE "serving_temperatures" <> '{}';
