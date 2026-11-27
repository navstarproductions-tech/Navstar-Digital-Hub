-- Explicit assessment mark category mapping for CAT, Practical and Final.
ALTER TABLE course_assessments ADD COLUMN marks_category TEXT NOT NULL DEFAULT 'Final';
