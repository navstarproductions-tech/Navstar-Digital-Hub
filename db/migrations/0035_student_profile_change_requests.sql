-- Student-submitted profile corrections require an administrator decision.
-- Additive only: existing profiles, accounts and enrolments remain unchanged.
CREATE TABLE IF NOT EXISTS student_profile_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changes_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_student_profile_change_requests_status_created
  ON student_profile_change_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_profile_change_requests_user_created
  ON student_profile_change_requests(user_id, created_at DESC);
