-- Secure, idempotent archive for the complete Base44 source dataset.
-- Operational records remain in D1; raw source records are retained here for
-- lossless reconciliation. Plaintext password fields are transformed at import.
CREATE TABLE IF NOT EXISTS base44_migration_tokens (
  token_hash TEXT PRIMARY KEY,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  records_received INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS base44_legacy_records (
  id TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_created_at TEXT,
  source_updated_at TEXT,
  record_json TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  migration_batch TEXT NOT NULL,
  UNIQUE(entity_name, source_id)
);
CREATE INDEX IF NOT EXISTS idx_base44_legacy_entity ON base44_legacy_records(entity_name);
CREATE INDEX IF NOT EXISTS idx_base44_legacy_batch ON base44_legacy_records(migration_batch);
