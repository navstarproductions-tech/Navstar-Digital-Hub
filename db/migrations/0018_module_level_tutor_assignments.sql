-- Allocate tutors to individual modules rather than entire courses.
CREATE TABLE IF NOT EXISTS module_tutor_assignments (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  tutor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(module_id,tutor_user_id)
);
CREATE INDEX IF NOT EXISTS idx_module_tutor_assignments_tutor
  ON module_tutor_assignments(tutor_user_id,module_id);
