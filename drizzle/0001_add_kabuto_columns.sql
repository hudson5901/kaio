-- Add kabuto category columns to items table
ALTER TABLE items ADD COLUMN IF NOT EXISTS kabuto_category text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS kabuto_category_confidence real;
ALTER TABLE items ADD COLUMN IF NOT EXISTS ebay_aspects text;
