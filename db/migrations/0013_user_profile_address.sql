-- Add an optional full address to account profiles without changing existing records.
ALTER TABLE user_profiles ADD COLUMN address TEXT;
