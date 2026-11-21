-- Additive exam metadata and safe archiving. Existing papers, questions, attempts and results are preserved.
ALTER TABLE course_assessments ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE course_assessments ADD COLUMN archived_at TEXT;
