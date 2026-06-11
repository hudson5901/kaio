-- Add per-staff listing readiness checks and scheduled listing date
ALTER TABLE items ADD COLUMN IF NOT EXISTS staff_checks text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS all_checked_at text;
ALTER TABLE items ADD COLUMN IF NOT EXISTS listing_scheduled_at text;
