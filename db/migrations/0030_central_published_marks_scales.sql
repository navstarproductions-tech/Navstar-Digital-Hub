-- Central published marks scales; preserve raw paper scores separately.
ALTER TABLE course_assessment_results ADD COLUMN raw_points_awarded REAL;
ALTER TABLE course_assessment_results ADD COLUMN published_max_points REAL;
UPDATE course_assessment_results
SET raw_points_awarded=points_awarded
WHERE raw_points_awarded IS NULL;
UPDATE course_assessment_results
SET published_max_points=(SELECT max_points FROM course_assessments WHERE course_assessments.id=course_assessment_results.assessment_id)
WHERE published_max_points IS NULL;
-- Legacy records with a zero maximum are repaired to the standard 100-mark paper scale.
UPDATE course_assessments SET max_points=100,pass_mark=50 WHERE max_points IS NULL OR max_points<=0;
