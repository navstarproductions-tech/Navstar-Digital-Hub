-- Academic operations shared by student, tutor and administrator portals.
-- Additive only; existing LMS submissions and student records remain unchanged.
CREATE TABLE IF NOT EXISTS student_module_registrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'registered' CHECK(status IN ('registered','completed','withdrawn')),
  registered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,module_id)
);
CREATE INDEX IF NOT EXISTS idx_module_registration_user ON student_module_registrations(user_id,status);

CREATE TABLE IF NOT EXISTS course_timetable (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES course_modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  venue TEXT NOT NULL DEFAULT '',
  meeting_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled','completed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_course_timetable_course ON course_timetable(course_id,starts_at,status);

CREATE TABLE IF NOT EXISTS course_attendance (
  id TEXT PRIMARY KEY,
  timetable_id TEXT NOT NULL REFERENCES course_timetable(id) ON DELETE CASCADE,
  student_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('present','late','absent','excused')),
  marked_by TEXT NOT NULL REFERENCES users(id),
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(timetable_id,student_user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_attendance_student ON course_attendance(student_user_id,marked_at);

CREATE TABLE IF NOT EXISTS course_live_classes (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES course_modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  meeting_url TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','live','completed','cancelled')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_live_classes_course ON course_live_classes(course_id,starts_at,status);

CREATE TABLE IF NOT EXISTS course_scholarships (
  id TEXT PRIMARY KEY,
  course_id TEXT REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  award_amount INTEGER NOT NULL DEFAULT 0 CHECK(award_amount>=0),
  deadline TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('draft','open','closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS scholarship_applications (
  id TEXT PRIMARY KEY,
  scholarship_id TEXT NOT NULL REFERENCES course_scholarships(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  statement TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(scholarship_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_scholarship_applications_user ON scholarship_applications(user_id,status);

CREATE TABLE IF NOT EXISTS student_graduation_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK(status IN ('candidate','eligible','graduated','deferred')),
  completed_at TEXT,
  updated_by TEXT NOT NULL REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,course_id)
);

CREATE TABLE IF NOT EXISTS student_report_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  period_label TEXT NOT NULL,
  summary_json TEXT NOT NULL DEFAULT '{}',
  issued_by TEXT NOT NULL REFERENCES users(id),
  issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id,course_id,period_label)
);
CREATE INDEX IF NOT EXISTS idx_report_cards_user ON student_report_cards(user_id,issued_at);

CREATE TABLE IF NOT EXISTS course_assessments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES course_modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  assessment_type TEXT NOT NULL DEFAULT 'test' CHECK(assessment_type IN ('test','exam','practical','cat')),
  instructions TEXT NOT NULL DEFAULT '',
  starts_at TEXT,
  due_at TEXT,
  max_points INTEGER NOT NULL DEFAULT 100 CHECK(max_points BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed')),
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS course_assessment_results (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points_awarded INTEGER NOT NULL CHECK(points_awarded>=0),
  feedback TEXT NOT NULL DEFAULT '',
  published_at TEXT,
  marked_by TEXT NOT NULL REFERENCES users(id),
  marked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assessment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_results_user ON course_assessment_results(user_id,published_at);

CREATE TABLE IF NOT EXISTS course_assessment_attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES course_assessments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','graded','returned')),
  points_awarded INTEGER,
  feedback TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  marked_by TEXT REFERENCES users(id),
  marked_at TEXT,
  UNIQUE(assessment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_user ON course_assessment_attempts(user_id,submitted_at);
