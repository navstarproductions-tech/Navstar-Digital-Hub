-- B2C phone payouts linked to the existing cashout approval workflow.
ALTER TABLE cashout_requests ADD COLUMN recipient_phone TEXT;
ALTER TABLE cashout_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT 'Navstar business payout';

CREATE TABLE IF NOT EXISTS mpesa_b2c_transactions (
  id TEXT PRIMARY KEY,
  cashout_request_id TEXT NOT NULL UNIQUE REFERENCES cashout_requests(id),
  originator_conversation_id TEXT NOT NULL UNIQUE,
  conversation_id TEXT,
  recipient_phone TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'submitting'
    CHECK (status IN ('submitting', 'accepted', 'paid', 'failed', 'unknown', 'cancelled')),
  result_code INTEGER,
  result_description TEXT,
  transaction_id TEXT,
  raw_result TEXT,
  requested_by TEXT REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  submitted_at TEXT,
  received_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mpesa_b2c_status_created_idx ON mpesa_b2c_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS mpesa_b2c_conversation_idx ON mpesa_b2c_transactions(conversation_id);
