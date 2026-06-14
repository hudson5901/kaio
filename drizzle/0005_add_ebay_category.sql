-- Per-item eBay category (overrides Kabuto-category default in mapping.ts)
-- ebay_category_id: 数値ID (例 "262317")
-- ebay_category_path: "Antiques > Asian Antiques > Japan > Armor" のような表示用フルパス
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_category_id text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_category_path text;
