-- eBay 出品中アイテムの最新スナップショット (Trading API GetItem 由来)
-- ebay_hit_count: 閲覧数 (Listing Page Views)
-- ebay_watch_count: ウォッチ数 (eBay の "いいね" 相当)
-- ebay_stats_updated_at: 最後に GetItem を回した時刻 (ISO 8601 string)
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_hit_count integer;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_watch_count integer;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_stats_updated_at text;
