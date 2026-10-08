-- 0035 已手動加過同一欄，從零重播時不能再加一次
ALTER TABLE "menu_item_add_on" ADD COLUMN IF NOT EXISTS "sort_order" integer DEFAULT 0 NOT NULL;