ALTER TYPE "public"."audit_resource" ADD VALUE 'storePhoto';--> statement-breakpoint
CREATE TABLE "store_photo" (
	"id" text PRIMARY KEY NOT NULL,
	"image" text NOT NULL,
	"alt" jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TRIGGER "record_deleted_row" BEFORE DELETE ON "public"."store_photo" FOR EACH ROW EXECUTE FUNCTION "public"."record_deleted_row"();--> statement-breakpoint
INSERT INTO "store_photo" ("id", "image", "alt", "sort_order")
SELECT
	gen_random_uuid()::text,
	'data:image/svg+xml;base64,' || replace(encode(convert_to(format('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="%s"/><stop offset="1" stop-color="%s"/></linearGradient></defs><rect width="1200" height="900" fill="url(#g)"/><circle cx="980" cy="160" r="280" fill="#fff" fill-opacity=".08"/><circle cx="160" cy="780" r="340" fill="#000" fill-opacity=".08"/><g fill="none" stroke="#fff" stroke-opacity=".85" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"><path d="M470 360h220v150a90 90 0 0 1-90 90h-40a90 90 0 0 1-90-90z"/><path d="M690 390h30a45 45 0 0 1 0 90h-30"/><path d="M530 300c-20-30 20-50 0-80M590 300c-20-30 20-50 0-80M650 300c-20-30 20-50 0-80"/></g><text x="600" y="720" text-anchor="middle" font-family="sans-serif" font-size="60" font-weight="700" fill="#fff">%s</text><text x="600" y="790" text-anchor="middle" font-family="sans-serif" font-size="32" letter-spacing="8" fill="#fff" fill-opacity=".7">示意照片</text></svg>', p.start_color, p.end_color, p.label), 'UTF8'), 'base64'), E'\n', ''),
	p.alt,
	p.sort_order
FROM (VALUES
	('#6f4e37', '#c69c6d', '門市外觀', '{"zh-TW": "門市外觀（示意圖）", "en": "Storefront (placeholder)", "ja": "店舗外観（イメージ）", "ko": "매장 외관 (예시 이미지)", "zh-CN": "门店外观（示意图）"}'::jsonb, 0),
	('#3e2c23', '#a47148', '吧台', '{"zh-TW": "吧台（示意圖）", "en": "Coffee bar (placeholder)", "ja": "バーカウンター（イメージ）", "ko": "커피 바 (예시 이미지)", "zh-CN": "吧台（示意图）"}'::jsonb, 1),
	('#5b6f4e', '#b7c4a0', '座位區', '{"zh-TW": "座位區（示意圖）", "en": "Seating area (placeholder)", "ja": "客席（イメージ）", "ko": "좌석 공간 (예시 이미지)", "zh-CN": "座位区（示意图）"}'::jsonb, 2),
	('#7a4b2a', '#e0b17a', '手沖咖啡', '{"zh-TW": "手沖咖啡（示意圖）", "en": "Pour-over coffee (placeholder)", "ja": "ハンドドリップコーヒー（イメージ）", "ko": "핸드드립 커피 (예시 이미지)", "zh-CN": "手冲咖啡（示意图）"}'::jsonb, 3),
	('#8c6a4f', '#ead7c0', '拿鐵', '{"zh-TW": "拿鐵（示意圖）", "en": "Latte (placeholder)", "ja": "ラテ（イメージ）", "ko": "라테 (예시 이미지)", "zh-CN": "拿铁（示意图）"}'::jsonb, 4),
	('#a0522d', '#f2c38b', '早午餐', '{"zh-TW": "早午餐（示意圖）", "en": "Brunch (placeholder)", "ja": "ブランチ（イメージ）", "ko": "브런치 (예시 이미지)", "zh-CN": "早午餐（示意图）"}'::jsonb, 5),
	('#8e4a5c', '#e8b4bc', '甜點', '{"zh-TW": "甜點（示意圖）", "en": "Dessert (placeholder)", "ja": "デザート（イメージ）", "ko": "디저트 (예시 이미지)", "zh-CN": "甜点（示意图）"}'::jsonb, 6),
	('#4a5d6e', '#a9c1d1', '窗邊座位', '{"zh-TW": "窗邊座位（示意圖）", "en": "Window seats (placeholder)", "ja": "窓際席（イメージ）", "ko": "창가 좌석 (예시 이미지)", "zh-CN": "窗边座位（示意图）"}'::jsonb, 7)
) AS p(start_color, end_color, label, alt, sort_order);
