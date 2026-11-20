-- Staff attendance and employee document registers. Additive only.
CREATE TABLE IF NOT EXISTS staff_attendance (
  id TEXT PRIMARY KEY,
  employee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','late','absent','leave')),
  check_in TEXT,
  check_out TEXT,
  notes TEXT NOT NULL DEFAULT '',
  recorded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(employee_user_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(attendance_date,status);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_employee ON staff_attendance(employee_user_id,attendance_date);
CREATE TABLE IF NOT EXISTS employee_documents (
  id TEXT PRIMARY KEY,
  employee_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  description TEXT NOT NULL DEFAULT '',
  object_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_employee_documents_employee ON employee_documents(employee_user_id,created_at);
