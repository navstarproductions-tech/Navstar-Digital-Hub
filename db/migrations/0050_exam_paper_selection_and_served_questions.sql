-- Persist the exact randomized paper and option order for each student attempt.
-- Marks mode chooses a randomized subset totaling the paper maximum where possible;
-- count mode chooses the configured number of questions without exceeding the paper maximum.
ALTER TABLE course_assessments ADD COLUMN question_selection_mode TEXT NOT NULL DEFAULT 'marks';
ALTER TABLE course_assessments ADD COLUMN question_count INTEGER NOT NULL DEFAULT 10;
ALTER TABLE course_assessments ADD COLUMN shuffle_options INTEGER NOT NULL DEFAULT 1;
ALTER TABLE exam_runtime_attempts ADD COLUMN served_question_ids_json TEXT NOT NULL DEFAULT '[]';
ALTER TABLE exam_runtime_attempts ADD COLUMN option_order_json TEXT NOT NULL DEFAULT '{}';
