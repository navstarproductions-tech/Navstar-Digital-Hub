-- Exam management defaults and institution-wide paper controls.
-- Additive: existing assessment records and results are preserved.
ALTER TABLE course_assessments ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE course_assessments ADD COLUMN pass_mark INTEGER NOT NULL DEFAULT 50;
ALTER TABLE course_assessments ADD COLUMN max_attempts INTEGER NOT NULL DEFAULT 1;
ALTER TABLE course_assessments ADD COLUMN require_full_fee_payment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_assessments ADD COLUMN require_assignment_submission INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_assessments ADD COLUMN allow_result_review INTEGER NOT NULL DEFAULT 1;
ALTER TABLE course_assessments ADD COLUMN shuffle_questions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_assessments ADD COLUMN disable_copy_paste INTEGER NOT NULL DEFAULT 0;
ALTER TABLE course_assessments ADD COLUMN strict_time_limit INTEGER NOT NULL DEFAULT 1;
ALTER TABLE course_assessments ADD COLUMN results_visible_until TEXT;

CREATE TABLE IF NOT EXISTS exam_institute_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  settings_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO exam_institute_settings(id,settings_json) VALUES('default','{}');
