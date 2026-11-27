-- Keep each uploaded Base44 export as an independent immutable package.
-- The legacy table used a global (entity_name, source_id) uniqueness key, which
-- prevented a later export from retaining the same source IDs in a new package.
CREATE TABLE IF NOT EXISTS base44_legacy_archive_records (
  id TEXT PRIMARY KEY,
  entity_name TEXT NOT NULL,
  source_id TEXT NOT NULL,
  source_created_at TEXT,
  source_updated_at TEXT,
  record_json TEXT NOT NULL,
  migration_batch TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(migration_batch, entity_name, source_id)
);
CREATE INDEX IF NOT EXISTS idx_base44_archive_batch_entity
  ON base44_legacy_archive_records(migration_batch, entity_name, source_id);
