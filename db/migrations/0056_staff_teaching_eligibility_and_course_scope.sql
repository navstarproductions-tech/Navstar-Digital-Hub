-- Teaching eligibility and course scope for tutors, administrators and principals.
ALTER TABLE user_profiles ADD COLUMN is_teaching INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN teaching_courses TEXT NOT NULL DEFAULT '[]';
