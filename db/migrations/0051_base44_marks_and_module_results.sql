-- Align LMS marking with the Base44 CAT / Practical / Final workflow.
-- Existing graded submissions remain approved; new tutor marks require administrator approval.
ALTER TABLE course_assignments ADD COLUMN marks_category TEXT NOT NULL DEFAULT 'CAT';
ALTER TABLE course_assignment_submissions ADD COLUMN approval_status TEXT NOT NULL DEFAULT 'approved';
ALTER TABLE course_assignment_submissions ADD COLUMN approved_by TEXT REFERENCES users(id);
ALTER TABLE course_assignment_submissions ADD COLUMN approved_at TEXT;
UPDATE course_assignment_submissions
SET approval_status='approved', approved_at=COALESCE(graded_at,submitted_at)
WHERE status='graded' AND approval_status='approved' AND points_awarded IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignment_submission_approval
ON course_assignment_submissions(assignment_id,approval_status,status);

-- StudentResult equivalent: one live result per learner and module.
CREATE TABLE IF NOT EXISTS student_module_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  cat_score REAL NOT NULL DEFAULT 0,
  practical_score REAL NOT NULL DEFAULT 0,
  exam_score REAL NOT NULL DEFAULT 0,
  assignment_score REAL NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0,
  max_score REAL NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'MM',
  remarks TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'incomplete' CHECK(status IN ('incomplete','published')),
  published_at TEXT,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,module_id)
);
CREATE INDEX IF NOT EXISTS idx_student_module_results_course
ON student_module_results(course_id,module_id,user_id);
