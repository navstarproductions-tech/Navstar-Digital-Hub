-- Permanent, verifiable completion certificates. Additive only.
CREATE TABLE IF NOT EXISTS student_certificates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  certificate_no TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','revoked')),
  issued_by TEXT NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  revoked_by TEXT REFERENCES users(id),
  revoked_at TEXT,
  revoke_reason TEXT,
  UNIQUE(user_id,course_id)
);
CREATE INDEX IF NOT EXISTS idx_student_certificates_user ON student_certificates(user_id,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_certificates_course ON student_certificates(course_id,issued_at DESC);
CREATE TABLE IF NOT EXISTS certificate_sequences (
  year TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
