-- Require administrator approval before a learner starts newly configured examinations.
ALTER TABLE course_assessments ADD COLUMN require_admin_approval INTEGER NOT NULL DEFAULT 0;
