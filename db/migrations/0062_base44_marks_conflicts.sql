CREATE TABLE IF NOT EXISTS base44_marks_conflicts (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  user_id TEXT,
  course_id TEXT,
  module_id TEXT,
  admission_number TEXT,
  student_email TEXT NOT NULL,
  student_name TEXT,
  unit_title TEXT,
  source_a TEXT,
  score_a REAL,
  source_b TEXT,
  score_b REAL,
  cat_score_a REAL,
  cat_score_b REAL,
  exam_score_a REAL,
  exam_score_b REAL,
  assignment_score_a REAL,
  assignment_score_b REAL,
  status TEXT NOT NULL DEFAULT 'pending',
  resolved_by TEXT,
  published_source TEXT,
  original_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_base44_marks_conflicts_course_status
  ON base44_marks_conflicts(course_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_base44_marks_conflicts_student
  ON base44_marks_conflicts(student_email,course_id);
