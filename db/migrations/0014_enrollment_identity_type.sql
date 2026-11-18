-- Store the selected identity document type for admissions verification.
ALTER TABLE enrollments ADD COLUMN identity_type TEXT;
CREATE INDEX IF NOT EXISTS idx_enrollments_identity_type_number ON enrollments(identity_type, identity_number);

ALTER TABLE enrollments ADD COLUMN sub_county TEXT;
ALTER TABLE enrollments ADD COLUMN ward TEXT;
ALTER TABLE enrollments ADD COLUMN location TEXT;
ALTER TABLE enrollments ADD COLUMN sub_location TEXT;
