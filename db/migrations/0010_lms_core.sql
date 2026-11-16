PRAGMA foreign_keys = ON;

-- Additive LMS foundation. Existing courses, applications, accounts and school records remain untouched.
CREATE TABLE IF NOT EXISTS course_modules (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_course_modules_course ON course_modules(course_id,status,sort_order);

CREATE TABLE IF NOT EXISTS course_lessons (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  video_url TEXT,
  resource_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  estimated_minutes INTEGER NOT NULL DEFAULT 15 CHECK (estimated_minutes BETWEEN 1 AND 1440),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_course_lessons_module ON course_lessons(module_id,status,sort_order);

CREATE TABLE IF NOT EXISTS course_lesson_progress (
  id TEXT PRIMARY KEY,
  lesson_id TEXT NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0,1)),
  completed_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(lesson_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_progress_user ON course_lesson_progress(user_id,completed);

CREATE TABLE IF NOT EXISTS course_assignments (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_id TEXT REFERENCES course_modules(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  max_points INTEGER NOT NULL DEFAULT 100 CHECK (max_points BETWEEN 1 AND 10000),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_course_assignments_course ON course_assignments(course_id,status,due_at);

CREATE TABLE IF NOT EXISTS course_assignment_submissions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES course_assignments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  response_text TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','graded','returned')),
  points_awarded INTEGER CHECK (points_awarded IS NULL OR points_awarded >= 0),
  feedback TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  graded_by TEXT REFERENCES users(id),
  graded_at TEXT,
  UNIQUE(assignment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_course_submissions_user ON course_assignment_submissions(user_id,submitted_at);
CREATE INDEX IF NOT EXISTS idx_course_submissions_assignment ON course_assignment_submissions(assignment_id,status);
