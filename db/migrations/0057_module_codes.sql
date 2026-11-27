ALTER TABLE course_modules ADD COLUMN module_code TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_modules_code_unique ON course_modules(module_code) WHERE module_code IS NOT NULL AND module_code != '';
