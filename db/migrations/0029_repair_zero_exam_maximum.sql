-- Repair legacy assessment papers that were saved with a zero maximum.
-- Keep all existing questions, attempts and results; only repair invalid paper maxima.
UPDATE course_assessments SET max_points=100, pass_mark=50 WHERE max_points IS NULL OR max_points<=0;
