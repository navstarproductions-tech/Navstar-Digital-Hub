-- Add national ID field to user profiles without changing existing accounts or identifiers.
ALTER TABLE user_profiles ADD COLUMN national_id TEXT;
