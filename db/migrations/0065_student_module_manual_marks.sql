-- Direct tutor/admin entry for CAT, practical and final module marks.
-- Manual category marks override calculated assessment aggregates for that category.
CREATE TABLE IF NOT EXISTS student_module_manual_marks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('CAT','Practical','Final')),
  points_awarded REAL NOT NULL CHECK (points_awarded >= 0),
  max_points REAL NOT NULL CHECK (max_points > 0 AND points_awarded <= max_points),
  feedback TEXT NOT NULL DEFAULT '',
  marked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,module_id,category)
);
CREATE INDEX IF NOT EXISTS idx_module_manual_marks_module ON student_module_manual_marks(module_id,user_id);
