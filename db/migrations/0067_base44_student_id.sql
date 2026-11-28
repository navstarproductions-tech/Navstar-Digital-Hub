-- Preserve the original Base44 student identifier alongside the official admission number.
ALTER TABLE enrollments ADD COLUMN student_id TEXT;
CREATE INDEX IF NOT EXISTS idx_enrollments_student_id ON enrollments(student_id);
