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
-- Preserve current tutor access by translating existing course allocations to their modules.
INSERT OR IGNORE INTO module_tutor_assignments(id,module_id,tutor_user_id,assigned_by)
SELECT lower(hex(randomblob(16))),m.id,a.tutor_user_id,a.assigned_by
FROM course_modules m JOIN course_tutor_assignments a ON a.course_id=m.course_id;
