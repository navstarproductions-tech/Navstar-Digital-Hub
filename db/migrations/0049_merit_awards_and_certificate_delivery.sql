-- Separate merit-award documents and certificate delivery tracking.
CREATE TABLE IF NOT EXISTS academic_merit_awards (
  id TEXT PRIMARY KEY,
  award_no TEXT NOT NULL UNIQUE,
  public_token TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id),
  period_label TEXT NOT NULL,
  award_rank INTEGER NOT NULL CHECK (award_rank BETWEEN 1 AND 3),
  score REAL NOT NULL,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','published')),
  created_by TEXT NOT NULL REFERENCES users(id),
  approved_by TEXT REFERENCES users(id),
  approved_at TEXT,
  published_by TEXT REFERENCES users(id),
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,course_id,period_label)
);
CREATE INDEX IF NOT EXISTS idx_academic_merit_awards_status ON academic_merit_awards(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_academic_merit_awards_user ON academic_merit_awards(user_id,published_at DESC);
ALTER TABLE student_certificates ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'pending' CHECK (delivery_status IN ('pending','delivered'));
ALTER TABLE student_certificates ADD COLUMN delivery_channel TEXT;
ALTER TABLE student_certificates ADD COLUMN delivery_reference TEXT;
ALTER TABLE student_certificates ADD COLUMN delivered_at TEXT;
ALTER TABLE student_certificates ADD COLUMN delivered_by TEXT REFERENCES users(id);
