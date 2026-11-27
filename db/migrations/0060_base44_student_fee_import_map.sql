-- Idempotency map for the focused Base44 student and fee migration.
CREATE TABLE IF NOT EXISTS base44_student_import_map (
  entity_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  user_id TEXT,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(entity_name, source_id)
);
CREATE INDEX IF NOT EXISTS idx_base44_student_import_user
  ON base44_student_import_map(user_id);
