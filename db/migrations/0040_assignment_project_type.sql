-- Distinguish project briefs from ordinary coursework assignments without duplicating the LMS submission system.
ALTER TABLE course_assignments ADD COLUMN assignment_type TEXT NOT NULL DEFAULT 'assignment' CHECK (assignment_type IN ('assignment','project'));
CREATE INDEX IF NOT EXISTS idx_course_assignments_type ON course_assignments(assignment_type,course_id,status);
