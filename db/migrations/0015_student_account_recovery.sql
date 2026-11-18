-- Student email OTP password recovery. Additive only; existing accounts and sessions remain intact.
CREATE TABLE IF NOT EXISTS student_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  reset_token_hash TEXT,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_recovery_email_created
  ON student_recovery_codes(email, created_at);
CREATE INDEX IF NOT EXISTS idx_student_recovery_user_created
  ON student_recovery_codes(user_id, created_at);
