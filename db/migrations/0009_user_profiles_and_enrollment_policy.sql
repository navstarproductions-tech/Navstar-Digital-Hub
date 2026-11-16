-- Additive account profiles, staff identifiers and enrolment payment policy.
-- Existing users and all operational records are preserved.
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  staff_id TEXT NOT NULL UNIQUE,
  portal_role TEXT NOT NULL CHECK (portal_role IN ('student','tutor','admissions','principal','admin','finance')),
  phone TEXT,
  date_of_birth TEXT,
  gender TEXT,
  citizenship TEXT,
  country TEXT NOT NULL DEFAULT 'Kenya',
  province TEXT,
  county TEXT,
  sub_county TEXT,
  constituency TEXT,
  ward TEXT,
  location TEXT,
  sub_location TEXT,
  department TEXT,
  job_title TEXT,
  employment_type TEXT,
  joined_on TEXT,
  profile_photo_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_role ON user_profiles(portal_role);
CREATE INDEX IF NOT EXISTS idx_user_profiles_county ON user_profiles(county);

WITH ranked AS (
  SELECT id, role, ROW_NUMBER() OVER (PARTITION BY role ORDER BY created_at, id) AS seq
  FROM users
)
INSERT OR IGNORE INTO user_profiles (user_id, staff_id, portal_role)
SELECT id,
  CASE role
    WHEN 'admin' THEN 'AD-'
    WHEN 'tutor' THEN 'TU-'
    WHEN 'admissions' THEN 'AM-'
    WHEN 'principal' THEN 'PR-'
    ELSE 'ST-'
  END || printf('%05d', 10000 + seq),
  role
FROM ranked;

INSERT OR IGNORE INTO system_state (key, value) VALUES
  ('enrollment-payment-policy', '{"minimumInitialPayment":0,"currency":"KES","allowInstallments":true}'),
  ('profile-policy', '{"requirePhone":true,"requireAddress":true}');
