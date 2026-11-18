CREATE TABLE IF NOT EXISTS customer_registration_otps (
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 full_name TEXT NOT NULL,
 phone TEXT,
 password_hash TEXT NOT NULL,
 password_salt TEXT NOT NULL,
 otp_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_customer_registration_otps_expiry ON customer_registration_otps(expires_at);
