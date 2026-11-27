-- Preserve Base44 assignment category caps for marks normalization.
ALTER TABLE course_assignments ADD COLUMN category_out_of REAL NOT NULL DEFAULT 20;
ALTER TABLE course_assessments ADD COLUMN category_out_of REAL NOT NULL DEFAULT 0;
