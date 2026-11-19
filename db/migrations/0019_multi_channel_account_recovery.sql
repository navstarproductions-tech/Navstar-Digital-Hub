-- Extend password recovery to every active portal role and either verified contact channel.
ALTER TABLE student_recovery_codes ADD COLUMN recovery_identifier TEXT;
ALTER TABLE student_recovery_codes ADD COLUMN delivery_channel TEXT NOT NULL DEFAULT 'email';
CREATE INDEX IF NOT EXISTS idx_student_recovery_identifier_created
  ON student_recovery_codes(recovery_identifier, delivery_channel, created_at);
