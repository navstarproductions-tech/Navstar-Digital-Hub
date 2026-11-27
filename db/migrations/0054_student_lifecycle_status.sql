-- Keep a distinct student lifecycle status while retaining the users.status
-- active/disabled values required by the existing authentication schema.
ALTER TABLE user_profiles ADD COLUMN student_status TEXT NOT NULL DEFAULT 'active'
  CHECK (student_status IN ('active','suspended','archived'));
UPDATE user_profiles SET student_status='archived'
WHERE user_id IN (SELECT id FROM users WHERE status='disabled');
