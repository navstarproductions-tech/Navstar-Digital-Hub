-- Additive academic admissions and configurable fee structures.
-- Existing course, student, application and payment records are preserved.
ALTER TABLE courses ADD COLUMN course_code TEXT;
ALTER TABLE enrollments ADD COLUMN admission_number TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_enrollments_admission_number
  ON enrollments(admission_number) WHERE admission_number IS NOT NULL AND admission_number <> '';
CREATE INDEX IF NOT EXISTS idx_enrollments_course_intake
  ON enrollments(course_id, preferred_intake, created_at);

CREATE TABLE IF NOT EXISTS course_fee_items (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  due_stage TEXT NOT NULL DEFAULT 'enrollment' CHECK (due_stage IN ('enrollment','before_term','anytime')),
  required INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(course_id,item_name)
);
CREATE INDEX IF NOT EXISTS idx_course_fee_items_course ON course_fee_items(course_id,active,sort_order);

CREATE TABLE IF NOT EXISTS enrollment_fee_items (
  id TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  fee_item_id TEXT REFERENCES course_fee_items(id) ON DELETE SET NULL,
  item_name TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  due_stage TEXT NOT NULL DEFAULT 'enrollment',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_enrollment_fee_items_enrollment ON enrollment_fee_items(enrollment_id);

CREATE TABLE IF NOT EXISTS admission_number_sequences (
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  intake_code TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0 CHECK (last_number BETWEEN 0 AND 999),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(course_id,intake_code)
);

-- Each course begins with an editable Admission fee line. The admin sets its actual amount.
INSERT OR IGNORE INTO course_fee_items (id,course_id,item_name,amount,due_stage,required,sort_order,active)
SELECT 'admission-' || id,id,'Admission fee',0,'enrollment',1,1,1 FROM courses;

CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_course_code ON courses(course_code) WHERE course_code IS NOT NULL AND course_code <> '';

-- Preserve the fee schedule applicable to every existing and future enrolment.
INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage)
SELECT 'snapshot-' || e.id || '-' || f.id,e.id,f.id,f.item_name,f.amount,f.due_stage
FROM enrollments e JOIN course_fee_items f ON f.course_id=e.course_id AND f.active=1;

CREATE TRIGGER IF NOT EXISTS trg_snapshot_course_fees_after_enrollment
AFTER INSERT ON enrollments
BEGIN
  INSERT OR IGNORE INTO enrollment_fee_items(id,enrollment_id,fee_item_id,item_name,amount,due_stage)
  SELECT 'snapshot-' || NEW.id || '-' || f.id,NEW.id,f.id,f.item_name,f.amount,f.due_stage
  FROM course_fee_items f WHERE f.course_id=NEW.course_id AND f.active=1;
END;
