-- Preserve an auditable history whenever an enrolled learner is transferred between courses.
CREATE TABLE IF NOT EXISTS student_course_transfer_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id),
  from_course_id TEXT NOT NULL REFERENCES courses(id),
  to_course_id TEXT NOT NULL REFERENCES courses(id),
  reason TEXT NOT NULL,
  notification_channel TEXT NOT NULL CHECK(notification_channel IN ('email','sms')),
  notification_status TEXT NOT NULL DEFAULT 'pending',
  transferred_by TEXT NOT NULL REFERENCES users(id),
  transferred_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_student_course_transfer_user ON student_course_transfer_history(user_id,transferred_at);
