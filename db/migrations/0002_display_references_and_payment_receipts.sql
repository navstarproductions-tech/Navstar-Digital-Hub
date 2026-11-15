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
ALTER TABLE services ADD COLUMN price_amount INTEGER;

-- Services are catalogue entries; customer requests and payments are stored separately.
CREATE TABLE IF NOT EXISTS service_requests (
  id TEXT PRIMARY KEY,
  display_ref TEXT NOT NULL UNIQUE,
  service_id TEXT NOT NULL REFERENCES services(id),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'completed', 'cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Extend supported incoming payment purposes without losing existing transactions.
-- Drop the old index first: SQLite keeps its name when the table is renamed.
DROP INDEX IF EXISTS payments_checkout_idx;
ALTER TABLE payments RENAME TO payments_legacy;
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('enrollment', 'donation', 'service')),
  reference_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'initiating' CHECK (status IN ('initiating', 'pending', 'paid', 'failed')),
  merchant_request_id TEXT,
  checkout_request_id TEXT UNIQUE,
  result_code INTEGER,
  receipt_number TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  display_reference TEXT,
  result_description TEXT,
  transaction_date TEXT,
  callback_phone TEXT,
  callback_amount INTEGER
);
INSERT INTO payments (id, purpose, reference_id, phone, amount, status, merchant_request_id, checkout_request_id, result_code, receipt_number, created_at, updated_at, display_reference)
SELECT id, purpose, reference_id, phone, amount, status, merchant_request_id, checkout_request_id, result_code, receipt_number, created_at, updated_at, NULL FROM payments_legacy;
DROP TABLE payments_legacy;
CREATE INDEX IF NOT EXISTS payments_checkout_idx ON payments(checkout_request_id);
CREATE INDEX IF NOT EXISTS service_requests_created_idx ON service_requests(created_at);

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
