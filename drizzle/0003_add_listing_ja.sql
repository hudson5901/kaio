-- Japanese translations of eBay listing text (for wording review)
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_title_ja text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_description_ja text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_aspects_ja text;
