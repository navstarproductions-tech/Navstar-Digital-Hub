ALTER TABLE enrollments ADD COLUMN source_enrollment_date TEXT;

CREATE TABLE IF NOT EXISTS academic_intakes (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL UNIQUE,
  intake_name TEXT NOT NULL,
  year TEXT NOT NULL,
  start_date TEXT,
  end_date TEXT,
  enrollment_open_date TEXT,
  enrollment_close_date TEXT,
  training_start_date TEXT,
  training_end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  course_limits_json TEXT NOT NULL DEFAULT '[]',
  source_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(intake_name, year)
);

CREATE INDEX IF NOT EXISTS idx_academic_intakes_dates
  ON academic_intakes(start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_enrollments_source_enrollment_date
  ON enrollments(source_enrollment_date);
