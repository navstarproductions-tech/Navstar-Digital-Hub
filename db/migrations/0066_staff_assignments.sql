-- Staff-wide tasks are separate from student coursework and never feed student marks.
CREATE TABLE IF NOT EXISTS staff_assignments (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_status_due ON staff_assignments(status,due_at,created_at);

CREATE TABLE IF NOT EXISTS staff_assignment_recipients (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES staff_assignments(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','submitted','returned','completed')),
  response_text TEXT NOT NULL DEFAULT '',
  attachment_url TEXT,
  submitted_at TEXT,
  feedback TEXT,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assignment_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_staff_assignment_recipient_user ON staff_assignment_recipients(user_id,status,assignment_id);
