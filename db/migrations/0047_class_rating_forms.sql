-- Configurable class-rating forms and detailed student responses.
CREATE TABLE IF NOT EXISTS class_rating_forms (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  items_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','archived')),
  created_by TEXT REFERENCES users(id),
  updated_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_class_rating_forms_status ON class_rating_forms(status,updated_at DESC);

CREATE TABLE IF NOT EXISTS class_rating_responses (
  id TEXT PRIMARY KEY,
  form_id TEXT NOT NULL REFERENCES class_rating_forms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  answers_json TEXT NOT NULL,
  overall_rating REAL NOT NULL DEFAULT 0 CHECK (overall_rating BETWEEN 0 AND 5),
  feedback TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(form_id,user_id,course_id)
);
CREATE INDEX IF NOT EXISTS idx_class_rating_responses_form ON class_rating_responses(form_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_class_rating_responses_course ON class_rating_responses(course_id,updated_at DESC);
