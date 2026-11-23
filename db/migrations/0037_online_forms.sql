-- Dedicated online form definitions and submissions. Additive only.
CREATE TABLE IF NOT EXISTS online_forms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  audience TEXT NOT NULL DEFAULT 'public' CHECK (audience IN ('public','student','customer')),
  fields_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_online_forms_status ON online_forms(status,updated_at DESC);
CREATE TABLE IF NOT EXISTS online_form_submissions (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES online_forms(id),
  respondent_user_id TEXT,
  respondent_email TEXT NOT NULL DEFAULT '',
  respondent_name TEXT NOT NULL DEFAULT '',
  answers_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed','rejected')),
  review_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_online_form_submissions_form ON online_form_submissions(form_id,submitted_at DESC);
