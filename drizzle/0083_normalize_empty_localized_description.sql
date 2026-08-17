-- 空的多語描述（{} 或各語系皆為空字串）一律存回 NULL，避免同一種「沒有描述」有兩種表示法
UPDATE "menu"
SET "description" = NULL
WHERE "description" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text("description") AS entry(lang, text)
    WHERE btrim(entry.text) <> ''
  );
--> statement-breakpoint
UPDATE "menu_section"
SET "description" = NULL
WHERE "description" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text("description") AS entry(lang, text)
    WHERE btrim(entry.text) <> ''
  );
--> statement-breakpoint
UPDATE "menu_item"
SET "description" = NULL
WHERE "description" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM jsonb_each_text("description") AS entry(lang, text)
    WHERE btrim(entry.text) <> ''
  );
