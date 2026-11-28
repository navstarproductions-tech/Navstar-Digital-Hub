-- Record every direct customer-to-business PayBill payment received by Safaricom.
CREATE TABLE IF NOT EXISTS mpesa_c2b_transactions (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE,
  business_shortcode TEXT NOT NULL,
  bill_reference TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL CHECK (amount > 0),
  msisdn TEXT,
  payer_name TEXT NOT NULL DEFAULT '',
  transaction_time TEXT,
  org_account_balance TEXT,
  raw_callback TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mpesa_c2b_received_idx ON mpesa_c2b_transactions(received_at DESC);
CREATE INDEX IF NOT EXISTS mpesa_c2b_reference_idx ON mpesa_c2b_transactions(bill_reference, received_at DESC);
CREATE INDEX IF NOT EXISTS mpesa_c2b_phone_idx ON mpesa_c2b_transactions(msisdn, received_at DESC);
