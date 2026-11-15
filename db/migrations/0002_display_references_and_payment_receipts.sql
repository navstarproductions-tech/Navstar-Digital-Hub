-- Human-readable references and richer M-Pesa payment confirmations.
CREATE TABLE IF NOT EXISTS reference_sequences (
  prefix TEXT PRIMARY KEY,
  next_value INTEGER NOT NULL CHECK (next_value > 0)
);

ALTER TABLE donations ADD COLUMN display_ref TEXT;
ALTER TABLE enrollments ADD COLUMN display_ref TEXT;
ALTER TABLE services ADD COLUMN display_ref TEXT;
ALTER TABLE cashout_requests ADD COLUMN display_ref TEXT;
ALTER TABLE payments ADD COLUMN display_reference TEXT;
ALTER TABLE payments ADD COLUMN result_description TEXT;
ALTER TABLE payments ADD COLUMN transaction_date TEXT;
ALTER TABLE payments ADD COLUMN callback_phone TEXT;
ALTER TABLE payments ADD COLUMN callback_amount INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS donations_display_ref_unique ON donations(display_ref);
CREATE UNIQUE INDEX IF NOT EXISTS enrollments_display_ref_unique ON enrollments(display_ref);
CREATE UNIQUE INDEX IF NOT EXISTS services_display_ref_unique ON services(display_ref);
CREATE UNIQUE INDEX IF NOT EXISTS cashouts_display_ref_unique ON cashout_requests(display_ref);

-- Backfill existing rows without changing their internal primary keys.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM donations
)
UPDATE donations SET display_ref = 'DON-' || printf('%03d', (SELECT n FROM ranked WHERE ranked.id = donations.id))
WHERE display_ref IS NULL;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM enrollments
)
UPDATE enrollments SET display_ref = 'ENR-' || printf('%03d', (SELECT n FROM ranked WHERE ranked.id = enrollments.id))
WHERE display_ref IS NULL;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM services
)
UPDATE services SET display_ref = 'SRV-' || printf('%03d', (SELECT n FROM ranked WHERE ranked.id = services.id))
WHERE display_ref IS NULL;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at, id) AS n FROM cashout_requests
)
UPDATE cashout_requests SET display_ref = 'COT-' || printf('%03d', (SELECT n FROM ranked WHERE ranked.id = cashout_requests.id))
WHERE display_ref IS NULL;

INSERT OR IGNORE INTO reference_sequences (prefix, next_value)
SELECT 'DON', COALESCE(MAX(CAST(substr(display_ref, 5) AS INTEGER)), 0) + 1 FROM donations;
INSERT OR IGNORE INTO reference_sequences (prefix, next_value)
SELECT 'ENR', COALESCE(MAX(CAST(substr(display_ref, 5) AS INTEGER)), 0) + 1 FROM enrollments;
INSERT OR IGNORE INTO reference_sequences (prefix, next_value)
SELECT 'SRV', COALESCE(MAX(CAST(substr(display_ref, 5) AS INTEGER)), 0) + 1 FROM services;
INSERT OR IGNORE INTO reference_sequences (prefix, next_value)
SELECT 'COT', COALESCE(MAX(CAST(substr(display_ref, 5) AS INTEGER)), 0) + 1 FROM cashout_requests;
