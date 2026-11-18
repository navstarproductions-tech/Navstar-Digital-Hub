-- Additive admissions workflow tables and fields. Existing enrolments and payment history are preserved.
ALTER TABLE enrollments ADD COLUMN application_details_json TEXT;
ALTER TABLE enrollments ADD COLUMN application_verified_at TEXT;
ALTER TABLE enrollments ADD COLUMN special_enrollment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE enrollments ADD COLUMN payment_exception TEXT;
ALTER TABLE enrollments ADD COLUMN payment_due_date TEXT;
ALTER TABLE enrollments ADD COLUMN approved_initial_payment INTEGER;
ALTER TABLE enrollments ADD COLUMN admissions_decision_reason TEXT;
ALTER TABLE enrollments ADD COLUMN admitted_user_id TEXT;

CREATE TABLE IF NOT EXISTS enrollment_application_otps (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  verification_token_hash TEXT,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified_at TEXT,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enrollment_otps_contact_created
  ON enrollment_application_otps(email, phone, created_at);

CREATE TABLE IF NOT EXISTS enrollment_special_approvals (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  approved_by TEXT NOT NULL REFERENCES users(id),
  exception_type TEXT NOT NULL,
  reason TEXT NOT NULL,
  approved_initial_payment INTEGER,
  payment_due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enrollment_special_approvals_enrollment
  ON enrollment_special_approvals(enrollment_id, created_at);

CREATE TABLE IF NOT EXISTS enrollment_letters (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  letter_type TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_enrollment_letters_enrollment
  ON enrollment_letters(enrollment_id, created_at);

CREATE TABLE IF NOT EXISTS student_password_setup_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_student_password_setup_user
  ON student_password_setup_tokens(user_id, created_at);
