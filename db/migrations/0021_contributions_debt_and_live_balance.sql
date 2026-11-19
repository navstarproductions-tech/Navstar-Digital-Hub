-- Contribution classifications, administrator review and Safaricom Account Balance snapshots.
-- Numbered after the current mainline migration 0020_customer_registration_otp.sql.
ALTER TABLE donations ADD COLUMN contribution_type TEXT NOT NULL DEFAULT 'donation' CHECK (contribution_type IN ('donation','contribution','debt_payment'));
ALTER TABLE donations ADD COLUMN payer_name TEXT;
ALTER TABLE donations ADD COLUMN debt_reference TEXT;
ALTER TABLE donations ADD COLUMN debt_description TEXT;
ALTER TABLE donations ADD COLUMN admin_status TEXT NOT NULL DEFAULT 'not_received' CHECK (admin_status IN ('not_received','pending_review','confirmed','flagged'));
ALTER TABLE donations ADD COLUMN admin_reviewed_by TEXT REFERENCES users(id);
ALTER TABLE donations ADD COLUMN admin_reviewed_at TEXT;
ALTER TABLE donations ADD COLUMN admin_review_note TEXT;

ALTER TABLE payments ADD COLUMN admin_status TEXT NOT NULL DEFAULT 'not_received' CHECK (admin_status IN ('not_received','pending_review','confirmed','flagged'));
ALTER TABLE payments ADD COLUMN admin_reviewed_by TEXT REFERENCES users(id);
ALTER TABLE payments ADD COLUMN admin_reviewed_at TEXT;
ALTER TABLE payments ADD COLUMN admin_review_note TEXT;

CREATE INDEX IF NOT EXISTS donations_type_created_idx ON donations(contribution_type, created_at);
CREATE INDEX IF NOT EXISTS payments_admin_status_idx ON payments(admin_status, updated_at);

CREATE TABLE IF NOT EXISTS mpesa_balance_snapshots (
  id TEXT PRIMARY KEY,
  request_id TEXT,
  result_code INTEGER,
  result_description TEXT,
  balance_text TEXT,
  balance_amount REAL,
  currency TEXT NOT NULL DEFAULT 'KES',
  raw_result TEXT,
  requested_by TEXT REFERENCES users(id),
  received_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mpesa_balance_created_idx ON mpesa_balance_snapshots(created_at);

-- Existing Safaricom-confirmed transactions require an administrator's first review.
UPDATE payments SET admin_status = 'pending_review' WHERE status = 'paid' AND admin_status = 'not_received';
UPDATE donations SET admin_status = 'pending_review' WHERE status = 'paid' AND admin_status = 'not_received';
