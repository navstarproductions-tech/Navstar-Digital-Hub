-- Preserve per-examination security and presentation policy imported from Base44.
ALTER TABLE course_assessments ADD COLUMN security_settings_json TEXT NOT NULL DEFAULT '{}';
